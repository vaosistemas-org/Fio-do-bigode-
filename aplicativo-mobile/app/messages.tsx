import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { File as ExpoFile } from 'expo-file-system';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { openBrowserAsync, WebBrowserPresentationStyle } from 'expo-web-browser';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { FioPageHeader } from '@/components/fio-shell/FioPageHeader';
import { FioColors, FioRadius } from '@/constants/fio-theme';
import { supabase } from '@/lib/supabase';

type ConversationType = 'direct' | 'work' | 'company';
type Conversation = {
  conversation_id: string;
  conversation_type: ConversationType;
  work_id: string | null;
  company_id: string | null;
  title: string;
  context_label: string;
  avatar_url: string | null;
  last_message: string;
  last_message_type: 'text' | 'image' | 'file' | null;
  last_message_at: string;
  unread_count: number;
  can_send: boolean;
};
type Message = {
  message_id: string;
  sender_id: string;
  sender_name: string;
  sender_avatar_url: string | null;
  body: string | null;
  message_type: 'text' | 'image' | 'file';
  storage_path: string | null;
  file_name: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  created_at: string;
  signed_url?: string | null;
};
type MessageContext = {
  context_type: 'work' | 'company';
  context_id: string;
  context_title: string;
  context_detail: string | null;
  can_send: boolean;
};
type DirectCandidate = {
  context_type: 'work' | 'company';
  context_id: string;
  context_title: string;
  user_id: string;
  full_name: string;
  avatar_url: string | null;
  role_title: string | null;
};
type PickedAttachment = {
  uri: string;
  name: string;
  mimeType: string | null;
  size: number | null;
  type: 'image' | 'file';
};

const MAX_FILE_BYTES = 50 * 1024 * 1024;
const firstParam = (value?: string | string[]) => Array.isArray(value) ? value[0] : value;
const initials = (value: string) => value.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
const cleanFileName = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9._-]/g, '-');
const formatDate = (value: string) => new Date(value).toLocaleString('pt-BR', {
  day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
});
function contextIcon(type: ConversationType): keyof typeof Ionicons.glyphMap {
  if (type === 'work') return 'business-outline';
  if (type === 'company') return 'people-outline';
  return 'person-outline';
}

export default function MessagesScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    conversationId?: string | string[];
    userId?: string | string[];
    workId?: string | string[];
    workGroup?: string | string[];
  }>();
  const routeConversationId = firstParam(params.conversationId);
  const routeUserId = firstParam(params.userId);
  const routeWorkId = firstParam(params.workId);
  const routeWorkGroup = firstParam(params.workGroup);
  const routeKey = `${routeConversationId ?? ''}:${routeUserId ?? ''}:${routeWorkId ?? ''}:${routeWorkGroup ?? ''}`;

  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [composerText, setComposerText] = useState('');
  const [attachment, setAttachment] = useState<PickedAttachment | null>(null);
  const [sending, setSending] = useState(false);
  const [createVisible, setCreateVisible] = useState(false);
  const [createType, setCreateType] = useState<ConversationType>('direct');
  const [contexts, setContexts] = useState<MessageContext[]>([]);
  const [candidates, setCandidates] = useState<DirectCandidate[]>([]);
  const [loadingCreate, setLoadingCreate] = useState(false);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const listRef = useRef<ScrollView>(null);
  const realtimeChannelSequence = useRef(0);
  const handledRoute = useRef('');

  const activeConversation = useMemo(
    () => conversations.find((item) => item.conversation_id === activeId) ?? null,
    [activeId, conversations]
  );

  const loadConversations = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setErrorMessage('');
    const result = await supabase.rpc('get_fio_conversations');
    if (result.error) setErrorMessage(result.error.message);
    else setConversations(((result.data ?? []) as Conversation[]).map((item) => ({
      ...item, unread_count: Number(item.unread_count ?? 0),
    })));
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setCurrentUserId(data.user?.id ?? null));
  }, []);
  useFocusEffect(useCallback(() => { loadConversations(); }, [loadConversations]));

  const loadMessages = useCallback(async (conversationId: string) => {
    setLoadingMessages(true);
    setErrorMessage('');
    const result = await supabase.rpc('get_fio_messages', { p_conversation_id: conversationId });
    if (result.error) {
      setErrorMessage(result.error.message);
      setLoadingMessages(false);
      return;
    }
    const rows = (result.data ?? []) as Message[];
    const withUrls = await Promise.all(rows.map(async (message) => {
      if (!message.storage_path) return message;
      const signed = await supabase.storage.from('fio-message-files').createSignedUrl(message.storage_path, 600);
      return { ...message, signed_url: signed.data?.signedUrl ?? null };
    }));
    setMessages(withUrls);
    await supabase.rpc('mark_fio_conversation_read', { p_conversation_id: conversationId });
    setConversations((current) => current.map((item) =>
      item.conversation_id === conversationId ? { ...item, unread_count: 0 } : item
    ));
    setLoadingMessages(false);
    setTimeout(() => listRef.current?.scrollToEnd({ animated: false }), 40);
  }, []);

  useEffect(() => {
    if (!activeId) {
      setMessages([]);
      return;
    }
    loadMessages(activeId);
    const channel = supabase.channel(
      `fio-conversation-${activeId}-${++realtimeChannelSequence.current}`
    ).on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'fio_messages', filter: `conversation_id=eq.${activeId}` },
      () => { loadMessages(activeId); loadConversations(); }
    ).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [activeId, loadConversations, loadMessages]);

  const openConversation = useCallback(async (
    type: ConversationType,
    contextId: string,
    userId?: string,
    directContextType?: 'work' | 'company'
  ) => {
    const result = await supabase.rpc('open_fio_conversation', {
      p_conversation_type: type,
      p_context_id: contextId,
      p_user_id: userId ?? null,
      p_direct_context_type: directContextType ?? null,
    });
    if (result.error || !result.data) {
      Alert.alert('Não foi possível abrir a conversa', result.error?.message ?? 'Tente novamente.');
      return null;
    }
    const conversationId = String(result.data);
    await loadConversations();
    setActiveId(conversationId);
    setCreateVisible(false);
    return conversationId;
  }, [loadConversations]);

  useEffect(() => {
    if (loading || handledRoute.current === routeKey || !routeKey.replace(/:/g, '')) return;
    handledRoute.current = routeKey;
    if (routeConversationId) setActiveId(routeConversationId);
    else if (routeWorkId && routeWorkGroup === '1') openConversation('work', routeWorkId);
    else if (routeWorkId && routeUserId) openConversation('direct', routeWorkId, routeUserId, 'work');
  }, [loading, openConversation, routeConversationId, routeKey, routeUserId, routeWorkGroup, routeWorkId]);

  async function showCreate() {
    setCreateVisible(true);
    setLoadingCreate(true);
    const [contextResult, candidateResult] = await Promise.all([
      supabase.rpc('get_fio_message_contexts'),
      supabase.rpc('get_fio_direct_candidates'),
    ]);
    if (contextResult.error || candidateResult.error) {
      Alert.alert('Não foi possível carregar os contatos', contextResult.error?.message ?? candidateResult.error?.message ?? 'Tente novamente.');
    }
    setContexts((contextResult.data ?? []) as MessageContext[]);
    setCandidates((candidateResult.data ?? []) as DirectCandidate[]);
    setLoadingCreate(false);
  }

  async function choosePhoto() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Fotos não autorizadas', 'Permita o acesso às fotos para enviar uma imagem.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.82 });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    if (asset.fileSize && asset.fileSize > MAX_FILE_BYTES) {
      Alert.alert('Arquivo muito grande', 'A foto deve possuir no máximo 50 MB.');
      return;
    }
    setAttachment({
      uri: asset.uri,
      name: asset.fileName || `foto-${Date.now()}.jpg`,
      mimeType: asset.mimeType ?? 'image/jpeg',
      size: asset.fileSize ?? null,
      type: 'image',
    });
  }

  async function chooseDocument() {
    const result = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true, multiple: false, type: '*/*' });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    if (asset.size && asset.size > MAX_FILE_BYTES) {
      Alert.alert('Arquivo muito grande', 'O documento deve possuir no máximo 50 MB.');
      return;
    }
    setAttachment({
      uri: asset.uri,
      name: asset.name || `documento-${Date.now()}`,
      mimeType: asset.mimeType ?? 'application/octet-stream',
      size: asset.size ?? null,
      type: 'file',
    });
  }

  async function sendMessage() {
    if (!activeId || sending || (!composerText.trim() && !attachment)) return;
    setSending(true);
    let uploadedPath: string | null = null;
    try {
      if (attachment) {
        uploadedPath = `${activeId}/${Date.now()}-${cleanFileName(attachment.name)}`;
        const bytes = await new ExpoFile(attachment.uri).bytes();
        const body = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
        const upload = await supabase.storage.from('fio-message-files').upload(uploadedPath, body, {
          contentType: attachment.mimeType ?? 'application/octet-stream', cacheControl: '3600', upsert: false,
        });
        if (upload.error) throw upload.error;
      }
      const result = await supabase.rpc('send_fio_message', {
        p_conversation_id: activeId,
        p_body: composerText.trim() || null,
        p_message_type: attachment?.type ?? 'text',
        p_storage_path: uploadedPath,
        p_file_name: attachment?.name ?? null,
        p_mime_type: attachment?.mimeType ?? null,
        p_size_bytes: attachment?.size ?? null,
      });
      if (result.error) throw result.error;
      setComposerText('');
      setAttachment(null);
      await Promise.all([loadMessages(activeId), loadConversations()]);
    } catch (error) {
      if (uploadedPath) await supabase.storage.from('fio-message-files').remove([uploadedPath]);
      Alert.alert('Não foi possível enviar', error instanceof Error ? error.message : 'Tente novamente.');
    } finally {
      setSending(false);
    }
  }

  async function openAttachment(message: Message) {
    if (!message.signed_url) {
      Alert.alert('Arquivo indisponível', 'Atualize a conversa e tente novamente.');
      return;
    }
    await openBrowserAsync(message.signed_url, { presentationStyle: WebBrowserPresentationStyle.FORM_SHEET });
  }

  function closeConversation() {
    setActiveId(null);
    if (routeConversationId || routeUserId || routeWorkGroup) router.replace('/messages');
  }

  const createItems = createType === 'direct' ? candidates : contexts.filter((item) => item.context_type === createType);

  return (
    <View style={styles.page}>
      <FioPageHeader
        eyebrow={activeConversation ? 'CONVERSA' : 'CENTRAL'}
        title={activeConversation?.title ?? 'Mensagens'}
        subtitle={activeConversation?.context_label ?? 'Equipe, obras e conversas diretas em um só lugar.'}
        actionIcon={activeConversation ? 'arrow-back-outline' : 'add-outline'}
        actionLabel={activeConversation ? 'Voltar às conversas' : 'Nova conversa'}
        onAction={activeConversation ? closeConversation : showCreate}
      />

      {!activeId ? (
        loading ? <ActivityIndicator style={styles.loading} color={FioColors.gold} /> : (
          <ScrollView
            contentContainerStyle={styles.listContent}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadConversations(true)} tintColor={FioColors.gold} />}
          >
            {!!errorMessage && <Text style={styles.errorText}>{errorMessage}</Text>}
            {conversations.length === 0 ? (
              <View style={styles.emptyCard}>
                <Ionicons name="chatbubbles-outline" size={30} color={FioColors.green} />
                <Text style={styles.emptyTitle}>Nenhuma conversa ainda</Text>
                <Text style={styles.emptyText}>Toque no + para falar com alguém ou abrir o grupo de uma obra ou empresa.</Text>
                <Pressable style={styles.startButton} onPress={showCreate}>
                  <Ionicons name="add-outline" size={17} color={FioColors.textOnAccent} />
                  <Text style={styles.startButtonText}>Nova conversa</Text>
                </Pressable>
              </View>
            ) : conversations.map((conversation) => (
              <Pressable key={conversation.conversation_id} style={({ pressed }) => [styles.conversationCard, pressed && styles.pressed]} onPress={() => setActiveId(conversation.conversation_id)}>
                <View style={styles.avatar}>
                  {conversation.avatar_url ? <Image source={{ uri: conversation.avatar_url }} style={styles.avatarImage} /> : conversation.conversation_type === 'direct' ? (
                    <Text style={styles.avatarText}>{initials(conversation.title)}</Text>
                  ) : <Ionicons name={contextIcon(conversation.conversation_type)} size={19} color={FioColors.green} />}
                </View>
                <View style={styles.conversationBody}>
                  <View style={styles.conversationTop}>
                    <Text numberOfLines={1} style={styles.conversationTitle}>{conversation.title}</Text>
                    <Text style={styles.conversationDate}>{formatDate(conversation.last_message_at)}</Text>
                  </View>
                  <Text numberOfLines={1} style={styles.contextLabel}>{conversation.context_label}</Text>
                  <View style={styles.previewRow}>
                    <Text numberOfLines={1} style={styles.previewText}>{conversation.last_message}</Text>
                    {conversation.unread_count > 0 && <View style={styles.unreadBadge}><Text style={styles.unreadBadgeText}>{conversation.unread_count > 99 ? '99+' : conversation.unread_count}</Text></View>}
                  </View>
                </View>
              </Pressable>
            ))}
          </ScrollView>
        )
      ) : (
        <KeyboardAvoidingView
          style={styles.chatArea}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={0}
        >
          {loadingMessages ? <ActivityIndicator style={styles.loading} color={FioColors.gold} /> : (
            <ScrollView
              ref={listRef}
              style={styles.messageList}
              contentContainerStyle={styles.messageContent}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="interactive"
              onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
            >
              {!!errorMessage && <Text style={styles.errorText}>{errorMessage}</Text>}
              {messages.length === 0 && <View style={styles.chatEmpty}><Text style={styles.emptyTitle}>Conversa aberta</Text><Text style={styles.emptyText}>Envie a primeira mensagem para iniciar.</Text></View>}
              {messages.map((message) => {
                const mine = message.sender_id === currentUserId;
                return (
                  <View key={message.message_id} style={[styles.messageRow, mine && styles.messageRowMine]}>
                    {!mine && (
                      <Pressable
                        style={styles.messageAvatar}
                        onPress={() => router.push({ pathname: '/public-profile', params: { userId: message.sender_id } })}
                      >
                        {message.sender_avatar_url ? (
                          <Image source={{ uri: message.sender_avatar_url }} style={styles.messageAvatarImage} contentFit="cover" />
                        ) : (
                          <Text style={styles.messageAvatarText}>{initials(message.sender_name)}</Text>
                        )}
                      </Pressable>
                    )}
                    <View style={[styles.bubble, mine && styles.bubbleMine]}>
                      {!mine && (
                        <Pressable onPress={() => router.push({ pathname: '/public-profile', params: { userId: message.sender_id } })}>
                          <Text style={styles.senderName}>{message.sender_name}</Text>
                        </Pressable>
                      )}
                      {message.message_type === 'image' && message.signed_url && (
                        <Pressable onPress={() => openAttachment(message)}><Image source={{ uri: message.signed_url }} style={styles.messageImage} contentFit="cover" /></Pressable>
                      )}
                      {message.message_type === 'file' && (
                        <Pressable style={styles.fileCard} onPress={() => openAttachment(message)}>
                          <Ionicons name="document-text-outline" size={22} color={FioColors.green} />
                          <View style={styles.fileIdentity}><Text numberOfLines={2} style={styles.fileName}>{message.file_name}</Text><Text style={styles.fileAction}>Tocar para abrir</Text></View>
                        </Pressable>
                      )}
                      {!!message.body && <Text style={styles.messageText}>{message.body}</Text>}
                      <Text style={styles.messageDate}>{formatDate(message.created_at)}</Text>
                    </View>
                  </View>
                );
              })}
            </ScrollView>
          )}

          {activeConversation?.can_send ? (
            <View style={styles.composerArea}>
              {!!attachment && <View style={styles.attachmentPreview}>
                <Ionicons name={attachment.type === 'image' ? 'image-outline' : 'document-outline'} size={17} color={FioColors.green} />
                <Text numberOfLines={1} style={styles.attachmentName}>{attachment.name}</Text>
                <Pressable onPress={() => setAttachment(null)}><Ionicons name="close-circle" size={20} color={FioColors.textMuted} /></Pressable>
              </View>}
              <View style={styles.composerRow}>
                <Pressable style={styles.attachButton} onPress={choosePhoto} disabled={sending}><Ionicons name="image-outline" size={20} color={FioColors.green} /></Pressable>
                <Pressable style={styles.attachButton} onPress={chooseDocument} disabled={sending}><Ionicons name="attach-outline" size={20} color={FioColors.green} /></Pressable>
                <TextInput style={styles.composerInput} value={composerText} onChangeText={setComposerText} placeholder="Escreva uma mensagem" placeholderTextColor={FioColors.textSoft} multiline maxLength={4000} />
                <Pressable style={[styles.sendButton, (!composerText.trim() && !attachment) && styles.sendDisabled]} onPress={sendMessage} disabled={sending || (!composerText.trim() && !attachment)}>
                  {sending ? <ActivityIndicator size="small" color={FioColors.textOnAccent} /> : <Ionicons name="send" size={18} color={FioColors.textOnAccent} />}
                </Pressable>
              </View>
            </View>
          ) : <View style={styles.readOnly}><Ionicons name="eye-outline" size={18} color={FioColors.textMuted} /><Text style={styles.readOnlyText}>Seu perfil possui acesso somente para leitura nesta conversa.</Text></View>}
        </KeyboardAvoidingView>
      )}

      <Modal visible={createVisible} transparent animationType="slide" onRequestClose={() => setCreateVisible(false)}>
        <View style={styles.modalBackdrop}><View style={styles.modalCard}>
          <View style={styles.modalHeader}>
            <View style={styles.modalIdentity}><Text style={styles.modalEyebrow}>NOVA CONVERSA</Text><Text style={styles.modalTitle}>Escolha onde conversar</Text></View>
            <Pressable style={styles.modalClose} onPress={() => setCreateVisible(false)}><Ionicons name="close-outline" size={21} color={FioColors.text} /></Pressable>
          </View>
          <View style={styles.typeTabs}>
            {([['direct', 'Pessoa'], ['work', 'Obra'], ['company', 'Empresa']] as const).map(([type, label]) => (
              <Pressable key={type} style={[styles.typeTab, createType === type && styles.typeTabActive]} onPress={() => setCreateType(type)}>
                <Text style={[styles.typeTabText, createType === type && styles.typeTabTextActive]}>{label}</Text>
              </Pressable>
            ))}
          </View>
          {loadingCreate ? <ActivityIndicator style={styles.modalLoading} color={FioColors.gold} /> : (
            <ScrollView style={styles.createList} contentContainerStyle={styles.createContent}>
              {createItems.length === 0 ? <Text style={styles.noOptions}>{createType === 'direct' ? 'Nenhum contato disponível para iniciar uma conversa.' : 'Nenhum contexto disponível para este perfil.'}</Text> : createType === 'direct' ? (
                (createItems as DirectCandidate[]).map((candidate) => (
                  <Pressable key={`${candidate.context_type}:${candidate.context_id}:${candidate.user_id}`} style={styles.createOption} disabled={!!openingId} onPress={async () => {
                    setOpeningId(candidate.user_id);
                    await openConversation('direct', candidate.context_id, candidate.user_id, candidate.context_type);
                    setOpeningId(null);
                  }}>
                    <View style={styles.optionAvatar}>{candidate.avatar_url ? <Image source={{ uri: candidate.avatar_url }} style={styles.avatarImage} /> : <Text style={styles.avatarText}>{initials(candidate.full_name)}</Text>}</View>
                    <View style={styles.optionIdentity}><Text style={styles.optionTitle}>{candidate.full_name}</Text><Text numberOfLines={1} style={styles.optionDetail}>{[candidate.role_title, candidate.context_title].filter(Boolean).join(' · ')}</Text></View>
                    {openingId === candidate.user_id ? <ActivityIndicator size="small" color={FioColors.green} /> : <Ionicons name="chevron-forward-outline" size={18} color={FioColors.textMuted} />}
                  </Pressable>
                ))
              ) : (
                (createItems as MessageContext[]).map((context) => (
                  <Pressable key={`${context.context_type}:${context.context_id}`} style={styles.createOption} disabled={!!openingId} onPress={async () => {
                    setOpeningId(context.context_id);
                    await openConversation(context.context_type, context.context_id);
                    setOpeningId(null);
                  }}>
                    <View style={styles.optionAvatar}><Ionicons name={contextIcon(context.context_type)} size={19} color={FioColors.green} /></View>
                    <View style={styles.optionIdentity}><Text style={styles.optionTitle}>{context.context_title}</Text><Text numberOfLines={1} style={styles.optionDetail}>{context.context_detail || (context.can_send ? 'Grupo da equipe' : 'Somente leitura')}</Text></View>
                    {openingId === context.context_id ? <ActivityIndicator size="small" color={FioColors.green} /> : <Ionicons name="chevron-forward-outline" size={18} color={FioColors.textMuted} />}
                  </Pressable>
                ))
              )}
            </ScrollView>
          )}
        </View></View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: FioColors.canvas },
  loading: { marginTop: 42 },
  listContent: { width: '100%', maxWidth: 760, alignSelf: 'center', padding: 12, paddingBottom: 80, gap: 8 },
  errorText: { padding: 10, borderRadius: 10, backgroundColor: FioColors.dangerSoft, fontSize: 10, color: FioColors.danger },
  emptyCard: { marginTop: 18, alignItems: 'center', padding: 28, borderWidth: 1, borderColor: FioColors.line, borderRadius: FioRadius.medium, backgroundColor: FioColors.surface },
  emptyTitle: { marginTop: 9, fontSize: 15, fontWeight: '900', color: FioColors.text },
  emptyText: { maxWidth: 410, marginTop: 5, textAlign: 'center', fontSize: 10, lineHeight: 15, color: FioColors.textMuted },
  startButton: { minHeight: 40, marginTop: 14, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 11, backgroundColor: FioColors.green },
  startButtonText: { fontSize: 11, fontWeight: '900', color: FioColors.textOnAccent },
  conversationCard: { minHeight: 76, padding: 11, flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: FioColors.line, borderRadius: 14, backgroundColor: FioColors.surface },
  avatar: { width: 46, height: 46, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', borderRadius: 999, backgroundColor: FioColors.greenSoft },
  avatarImage: { width: '100%', height: '100%' },
  avatarText: { fontSize: 12, fontWeight: '900', color: FioColors.green },
  conversationBody: { flex: 1, minWidth: 0 },
  conversationTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  conversationTitle: { flex: 1, fontSize: 12, fontWeight: '900', color: FioColors.text },
  conversationDate: { fontSize: 8, color: FioColors.textSoft },
  contextLabel: { marginTop: 2, fontSize: 9, color: FioColors.gold },
  previewRow: { marginTop: 5, flexDirection: 'row', alignItems: 'center', gap: 8 },
  previewText: { flex: 1, fontSize: 10, color: FioColors.textMuted },
  unreadBadge: { minWidth: 21, height: 21, paddingHorizontal: 5, alignItems: 'center', justifyContent: 'center', borderRadius: 999, backgroundColor: FioColors.orange },
  unreadBadgeText: { fontSize: 8, fontWeight: '900', color: FioColors.textOnAccent },
  chatArea: { flex: 1 },
  messageList: { flex: 1 },
  messageContent: { width: '100%', maxWidth: 760, alignSelf: 'center', padding: 12, paddingBottom: 18 },
  chatEmpty: { marginTop: 30, alignItems: 'center' },
  messageRow: { marginBottom: 7, flexDirection: 'row', justifyContent: 'flex-start' },
  messageRowMine: { justifyContent: 'flex-end' },
  messageAvatar: { width: 32, height: 32, marginTop: 4, marginRight: 7, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', borderRadius: 999, backgroundColor: FioColors.greenSoft },
  messageAvatarImage: { width: '100%', height: '100%' },
  messageAvatarText: { fontSize: 9, fontWeight: '900', color: FioColors.green },
  bubble: { maxWidth: '84%', padding: 9, borderWidth: 1, borderColor: FioColors.line, borderRadius: 14, borderBottomLeftRadius: 4, backgroundColor: FioColors.surface },
  bubbleMine: { borderColor: FioColors.green, borderBottomLeftRadius: 14, borderBottomRightRadius: 4, backgroundColor: FioColors.greenSoft },
  senderName: { marginBottom: 4, fontSize: 9, fontWeight: '900', color: FioColors.gold },
  messageText: { fontSize: 12, lineHeight: 17, color: FioColors.text },
  messageDate: { marginTop: 5, alignSelf: 'flex-end', fontSize: 7, color: FioColors.textSoft },
  messageImage: { width: 220, maxWidth: '100%', height: 175, marginBottom: 6, borderRadius: 10, backgroundColor: FioColors.surfaceRaised },
  fileCard: { minWidth: 210, padding: 9, flexDirection: 'row', alignItems: 'center', gap: 9, borderRadius: 10, backgroundColor: FioColors.surfaceRaised },
  fileIdentity: { flex: 1, minWidth: 0 },
  fileName: { fontSize: 10, fontWeight: '800', color: FioColors.text },
  fileAction: { marginTop: 2, fontSize: 8, color: FioColors.green },
  composerArea: { padding: 8, borderTopWidth: 1, borderTopColor: FioColors.line, backgroundColor: FioColors.surfaceMuted },
  attachmentPreview: { width: '100%', maxWidth: 760, alignSelf: 'center', marginBottom: 6, padding: 8, flexDirection: 'row', alignItems: 'center', gap: 7, borderRadius: 10, backgroundColor: FioColors.surfaceRaised },
  attachmentName: { flex: 1, fontSize: 9, color: FioColors.text },
  composerRow: { width: '100%', maxWidth: 760, alignSelf: 'center', flexDirection: 'row', alignItems: 'flex-end', gap: 5 },
  attachButton: { width: 39, height: 39, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: FioColors.line, borderRadius: 11, backgroundColor: FioColors.surface },
  composerInput: { flex: 1, minHeight: 39, maxHeight: 110, paddingHorizontal: 11, paddingVertical: 9, borderWidth: 1, borderColor: FioColors.line, borderRadius: 13, backgroundColor: FioColors.surface, fontSize: 11, color: FioColors.text },
  sendButton: { width: 41, height: 41, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: FioColors.green },
  sendDisabled: { opacity: 0.42 },
  readOnly: { margin: 8, padding: 11, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 11, backgroundColor: FioColors.surfaceRaised },
  readOnlyText: { fontSize: 10, color: FioColors.textMuted },
  modalBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(10, 12, 10, 0.74)' },
  modalCard: { maxHeight: '82%', minHeight: '55%', borderTopLeftRadius: 22, borderTopRightRadius: 22, borderWidth: 1, borderColor: FioColors.line, backgroundColor: FioColors.surface },
  modalHeader: { padding: 14, flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: 1, borderBottomColor: FioColors.line },
  modalIdentity: { flex: 1 },
  modalEyebrow: { fontSize: 7, fontWeight: '900', letterSpacing: 1, color: FioColors.gold },
  modalTitle: { marginTop: 2, fontSize: 17, fontWeight: '900', color: FioColors.text },
  modalClose: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 999, backgroundColor: FioColors.surfaceRaised },
  typeTabs: { margin: 12, padding: 3, flexDirection: 'row', borderRadius: 12, backgroundColor: FioColors.surfaceMuted },
  typeTab: { flex: 1, minHeight: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 9 },
  typeTabActive: { backgroundColor: FioColors.greenSoft },
  typeTabText: { fontSize: 10, fontWeight: '800', color: FioColors.textMuted },
  typeTabTextActive: { color: FioColors.green },
  modalLoading: { marginTop: 40 },
  createList: { flex: 1 },
  createContent: { paddingHorizontal: 12, paddingBottom: 28, gap: 7 },
  noOptions: { padding: 24, textAlign: 'center', fontSize: 10, color: FioColors.textMuted },
  createOption: { minHeight: 62, padding: 9, flexDirection: 'row', alignItems: 'center', gap: 9, borderWidth: 1, borderColor: FioColors.line, borderRadius: 13, backgroundColor: FioColors.surfaceMuted },
  optionAvatar: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', borderRadius: 999, backgroundColor: FioColors.greenSoft },
  optionIdentity: { flex: 1, minWidth: 0 },
  optionTitle: { fontSize: 11, fontWeight: '900', color: FioColors.text },
  optionDetail: { marginTop: 3, fontSize: 9, color: FioColors.textMuted },
  pressed: { opacity: 0.68 },
});
