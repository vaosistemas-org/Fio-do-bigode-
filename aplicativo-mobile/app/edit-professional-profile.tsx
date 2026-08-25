import {
    useCallback,
    useState,
} from 'react';

import {
    ActivityIndicator,
    Image,
    KeyboardAvoidingView,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Switch,
    Text,
    TextInput,
    View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';

import {
    useFocusEffect,
    useLocalSearchParams,
    useRouter,
} from 'expo-router';

import { supabase } from '@/lib/supabase';

type CompanyProfile = {
  id: string;
  name: string;
  legal_name: string | null;
  business_type: string | null;
  description: string | null;
  logo_path: string | null;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  website: string | null;
  instagram: string | null;
  address_line: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  coverage_area: string | null;
  services: string[];
  active: boolean;
  can_manage: boolean;
};

export default function EditProfessionalProfileScreen() {
  const router = useRouter();

  const { companyId } =
    useLocalSearchParams<{
      companyId: string;
    }>();

  const [
    company,
    setCompany,
  ] =
    useState<CompanyProfile | null>(
      null
    );

  const [name, setName] =
    useState('');

  const [
    legalName,
    setLegalName,
  ] = useState('');

  const [
    businessType,
    setBusinessType,
  ] = useState('');

  const [
    description,
    setDescription,
  ] = useState('');

  const [phone, setPhone] =
    useState('');

  const [
    whatsapp,
    setWhatsapp,
  ] = useState('');

  const [email, setEmail] =
    useState('');

  const [website, setWebsite] =
    useState('');

  const [
    instagram,
    setInstagram,
  ] = useState('');

  const [
    addressLine,
    setAddressLine,
  ] = useState('');

  const [city, setCity] =
    useState('');

  const [state, setState] =
    useState('');

  const [
    postalCode,
    setPostalCode,
  ] = useState('');

  const [
    coverageArea,
    setCoverageArea,
  ] = useState('');

  const [
    servicesText,
    setServicesText,
  ] = useState('');

  const [active, setActive] =
    useState(true);
  const [logoUrl, setLogoUrl] = useState('');
  const [coverUrl, setCoverUrl] = useState('');

  const [loading, setLoading] =
    useState(true);

  const [saving, setSaving] =
    useState(false);

  const [
    errorMessage,
    setErrorMessage,
  ] = useState('');

  const [
    successMessage,
    setSuccessMessage,
  ] = useState('');

  async function loadCompany() {
    if (!companyId) {
      setErrorMessage(
        'Empresa não encontrada.'
      );

      setLoading(false);
      return;
    }

    setLoading(true);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      const {
        data,
        error,
      } = await supabase.rpc(
        'get_company_profile',
        {
          p_company_id:
            companyId,
        }
      );

      if (error) {
        setErrorMessage(
          error.message
        );

        return;
      }

      const loadedCompany =
        data?.[0] as
          | CompanyProfile
          | undefined;

      if (!loadedCompany) {
        setErrorMessage(
          'Perfil profissional não encontrado.'
        );

        return;
      }

      if (
        !loadedCompany.can_manage
      ) {
        setErrorMessage(
          'Você não possui permissão para editar este perfil.'
        );

        return;
      }

      setCompany(
        loadedCompany
      );

      const media = await supabase.rpc('get_company_public_media', { p_company_id: loadedCompany.id });
      if (!media.error && media.data?.[0]) {
        setLogoUrl(media.data[0].logo_url ?? '');
        setCoverUrl(media.data[0].cover_url ?? '');
      }

      setName(
        loadedCompany.name ?? ''
      );

      setLegalName(
        loadedCompany.legal_name ??
          ''
      );

      setBusinessType(
        loadedCompany.business_type ??
          ''
      );

      setDescription(
        loadedCompany.description ??
          ''
      );

      setPhone(
        loadedCompany.phone ?? ''
      );

      setWhatsapp(
        loadedCompany.whatsapp ??
          ''
      );

      setEmail(
        loadedCompany.email ?? ''
      );

      setWebsite(
        loadedCompany.website ??
          ''
      );

      setInstagram(
        loadedCompany.instagram ??
          ''
      );

      setAddressLine(
        loadedCompany.address_line ??
          ''
      );

      setCity(
        loadedCompany.city ?? ''
      );

      setState(
        loadedCompany.state ?? ''
      );

      setPostalCode(
        loadedCompany.postal_code ??
          ''
      );

      setCoverageArea(
        loadedCompany.coverage_area ??
          ''
      );

      setServicesText(
        (
          loadedCompany.services ??
          []
        ).join(', ')
      );

      setActive(
        loadedCompany.active
      );
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'Não foi possível carregar o perfil profissional.'
      );
    } finally {
      setLoading(false);
    }
  }

  useFocusEffect(
    useCallback(() => {
      loadCompany();
    }, [companyId])
  );

  function buildServices() {
    const services =
      servicesText
        .split(/[,;\n]/)
        .map((service) =>
          service.trim()
        )
        .filter(Boolean);

    return [
      ...new Set(services),
    ];
  }

  function validate() {
    if (!name.trim()) {
      setErrorMessage(
        'Informe o nome da empresa.'
      );

      return false;
    }

    return true;
  }

  async function chooseCompanyImage(kind: 'logo' | 'cover') {
    if (!company) return;
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: kind === 'cover' ? [16, 7] : [1, 1], quality: 0.82 });
    if (result.canceled) return;
    setErrorMessage(''); setSuccessMessage('Enviando imagem...');
    const asset = result.assets[0];
    const bytes = await fetch(asset.uri).then((response) => response.arrayBuffer());
    const path = `companies/${company.id}/${kind}`;
    const sent = await supabase.storage.from('avatars').upload(path, bytes, { contentType: asset.mimeType ?? 'image/jpeg', cacheControl: '3600', upsert: true });
    if (sent.error) { setErrorMessage(sent.error.message); setSuccessMessage(''); return; }
    const url = `${supabase.storage.from('avatars').getPublicUrl(path).data.publicUrl}?v=${Date.now()}`;
    const saved = await supabase.rpc('set_company_public_image', { p_company_id: company.id, p_image_kind: kind, p_image_url: url });
    if (saved.error) { setErrorMessage(saved.error.message); setSuccessMessage(''); return; }
    if (kind === 'logo') setLogoUrl(url); else setCoverUrl(url);
    setSuccessMessage('Imagem da empresa atualizada.');
  }

  async function handleSave(
    stayOnPage = false
  ) {
    if (
      !company ||
      saving ||
      !validate()
    ) {
      return;
    }

    setSaving(true);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      const {
        error,
      } = await supabase.rpc(
        'update_company_profile',
        {
          p_company_id:
            company.id,

          p_name:
            name.trim(),

          p_legal_name:
            legalName.trim() ||
            null,

          p_business_type:
            businessType.trim() ||
            null,

          p_description:
            description.trim() ||
            null,

          p_logo_path:
            company.logo_path,

          p_phone:
            phone.trim() ||
            null,

          p_whatsapp:
            whatsapp.trim() ||
            null,

          p_email:
            email.trim() ||
            null,

          p_website:
            website.trim() ||
            null,

          p_instagram:
            instagram.trim() ||
            null,

          p_address_line:
            addressLine.trim() ||
            null,

          p_city:
            city.trim() ||
            null,

          p_state:
            state.trim() ||
            null,

          p_postal_code:
            postalCode.trim() ||
            null,

          p_coverage_area:
            coverageArea.trim() ||
            null,

          p_services:
            buildServices(),

          p_active:
            active,
        }
      );

      if (error) {
        setErrorMessage(
          error.message
        );

        return;
      }

      if (stayOnPage) {
        setSuccessMessage(
          'Perfil profissional atualizado.'
        );

        await loadCompany();
        return;
      }

      router.replace({
        pathname:
          '/professional-profile',
        params: {
          companyId:
            company.id,
        },
      });
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'Não foi possível salvar o perfil profissional.'
      );
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <View
        style={styles.loading}
      >
        <ActivityIndicator />

        <Text
          style={
            styles.loadingText
          }
        >
          Carregando edição...
        </Text>
      </View>
    );
  }

  if (!company) {
    return (
      <View
        style={styles.loading}
      >
        <Text
          style={styles.errorText}
        >
          {errorMessage ||
            'Perfil profissional não encontrado.'}
        </Text>

        <Pressable
          style={
            styles.returnButton
          }
          onPress={() =>
            router.back()
          }
        >
          <Text
            style={
              styles.returnButtonText
            }
          >
            Voltar
          </Text>
        </Pressable>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.page}
      behavior={
        Platform.OS === 'ios'
          ? 'padding'
          : undefined
      }
    >
      <ScrollView
        contentContainerStyle={
          styles.content
        }
        showsVerticalScrollIndicator={
          false
        }
        keyboardShouldPersistTaps="handled"
      >
        <View
          style={styles.topBar}
        >
          <View>
            <Text
              style={styles.brand}
            >
              FIO
            </Text>

            <Text
              style={
                styles.brandSubtitle
              }
            >
              GESTÃO DE OBRAS
            </Text>
          </View>
        </View>

        <Pressable
          style={
            styles.backButton
          }
          onPress={() =>
            router.back()
          }
          disabled={saving}
        >
          <Text
            style={
              styles.backButtonText
            }
          >
            ‹ Perfil profissional
          </Text>
        </Pressable>

        <Text
          style={styles.eyebrow}
        >
          PERFIL PROFISSIONAL
        </Text>

        <Text
          style={styles.title}
        >
          Editar empresa
        </Text>

        <Text
          style={styles.subtitle}
        >
          Mantenha as informações
          profissionais atualizadas
          para sua equipe e suas
          obras.
        </Text>

        <Pressable style={styles.coverMedia} onPress={() => void chooseCompanyImage('cover')}>
          {coverUrl ? <Image source={{ uri: coverUrl }} style={styles.mediaImage} /> : <Text style={styles.mediaPlaceholder}>Adicionar foto de capa</Text>}
          <Text style={styles.mediaAction}>{coverUrl ? 'Trocar capa' : 'Adicionar capa'}</Text>
        </Pressable>
        <Pressable style={styles.logoMedia} onPress={() => void chooseCompanyImage('logo')}>
          {logoUrl ? <Image source={{ uri: logoUrl }} style={styles.mediaImage} /> : <Text style={styles.logoPlaceholderText}>{name.trim().charAt(0).toUpperCase() || 'F'}</Text>}
          <Text style={styles.logoAction}>Editar logo</Text>
        </Pressable>

        <View
          style={styles.card}
        >
          <Text
            style={
              styles.sectionTitle
            }
          >
            IDENTIDADE
          </Text>

          <Text
            style={styles.label}
          >
            Nome comercial *
          </Text>

          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="Nome da empresa"
            placeholderTextColor="#A0A5A8"
            editable={!saving}
          />

          <Text
            style={styles.label}
          >
            Razão social
          </Text>

          <TextInput
            style={styles.input}
            value={legalName}
            onChangeText={
              setLegalName
            }
            placeholder="Opcional"
            placeholderTextColor="#A0A5A8"
            editable={!saving}
          />

          <Text
            style={styles.label}
          >
            Tipo de negócio
          </Text>

          <TextInput
            style={styles.input}
            value={businessType}
            onChangeText={
              setBusinessType
            }
            placeholder="Ex.: Marcenaria, loja, arquitetura..."
            placeholderTextColor="#A0A5A8"
            editable={!saving}
          />

          <Text
            style={styles.label}
          >
            Sobre a empresa
          </Text>

          <TextInput
            style={[
              styles.input,
              styles.textArea,
            ]}
            value={description}
            onChangeText={
              setDescription
            }
            placeholder="Conte brevemente sobre a empresa e sua atuação."
            placeholderTextColor="#A0A5A8"
            editable={!saving}
            multiline
            textAlignVertical="top"
          />
        </View>

        <View
          style={styles.card}
        >
          <Text
            style={
              styles.sectionTitle
            }
          >
            SERVIÇOS
          </Text>

          <Text
            style={styles.label}
          >
            Serviços oferecidos
          </Text>

          <TextInput
            style={[
              styles.input,
              styles.textArea,
            ]}
            value={servicesText}
            onChangeText={
              setServicesText
            }
            placeholder="Ex.: Móveis planejados, montagem, medição, assistência técnica"
            placeholderTextColor="#A0A5A8"
            editable={!saving}
            multiline
            textAlignVertical="top"
          />

          <Text
            style={
              styles.helperText
            }
          >
            Separe os serviços por
            vírgula ou coloque um por
            linha.
          </Text>
        </View>

        <View
          style={styles.card}
        >
          <Text
            style={
              styles.sectionTitle
            }
          >
            CONTATO
          </Text>

          <Text
            style={styles.label}
          >
            WhatsApp
          </Text>

          <TextInput
            style={styles.input}
            value={whatsapp}
            onChangeText={
              setWhatsapp
            }
            placeholder="WhatsApp profissional"
            placeholderTextColor="#A0A5A8"
            editable={!saving}
            keyboardType="phone-pad"
          />

          <Text
            style={styles.label}
          >
            Telefone
          </Text>

          <TextInput
            style={styles.input}
            value={phone}
            onChangeText={setPhone}
            placeholder="Telefone"
            placeholderTextColor="#A0A5A8"
            editable={!saving}
            keyboardType="phone-pad"
          />

          <Text
            style={styles.label}
          >
            E-mail
          </Text>

          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            placeholder="E-mail profissional"
            placeholderTextColor="#A0A5A8"
            editable={!saving}
            keyboardType="email-address"
            autoCapitalize="none"
          />

          <Text
            style={styles.label}
          >
            Site
          </Text>

          <TextInput
            style={styles.input}
            value={website}
            onChangeText={
              setWebsite
            }
            placeholder="Site da empresa"
            placeholderTextColor="#A0A5A8"
            editable={!saving}
            autoCapitalize="none"
          />

          <Text
            style={styles.label}
          >
            Instagram
          </Text>

          <TextInput
            style={styles.input}
            value={instagram}
            onChangeText={
              setInstagram
            }
            placeholder="@empresa"
            placeholderTextColor="#A0A5A8"
            editable={!saving}
            autoCapitalize="none"
          />
        </View>

        <View
          style={styles.card}
        >
          <Text
            style={
              styles.sectionTitle
            }
          >
            LOCALIZAÇÃO
          </Text>

          <Text
            style={styles.label}
          >
            Endereço
          </Text>

          <TextInput
            style={styles.input}
            value={addressLine}
            onChangeText={
              setAddressLine
            }
            placeholder="Endereço da empresa"
            placeholderTextColor="#A0A5A8"
            editable={!saving}
          />

          <Text
            style={styles.label}
          >
            Cidade
          </Text>

          <TextInput
            style={styles.input}
            value={city}
            onChangeText={setCity}
            placeholder="Cidade"
            placeholderTextColor="#A0A5A8"
            editable={!saving}
          />

          <Text
            style={styles.label}
          >
            Estado
          </Text>

          <TextInput
            style={styles.input}
            value={state}
            onChangeText={setState}
            placeholder="Ex.: RS"
            placeholderTextColor="#A0A5A8"
            editable={!saving}
            autoCapitalize="characters"
            maxLength={2}
          />

          <Text
            style={styles.label}
          >
            CEP
          </Text>

          <TextInput
            style={styles.input}
            value={postalCode}
            onChangeText={
              setPostalCode
            }
            placeholder="CEP"
            placeholderTextColor="#A0A5A8"
            editable={!saving}
            keyboardType="number-pad"
          />

          <Text
            style={styles.label}
          >
            Área de atendimento
          </Text>

          <TextInput
            style={[
              styles.input,
              styles.smallTextArea,
            ]}
            value={coverageArea}
            onChangeText={
              setCoverageArea
            }
            placeholder="Ex.: Porto Alegre e região metropolitana"
            placeholderTextColor="#A0A5A8"
            editable={!saving}
            multiline
            textAlignVertical="top"
          />
        </View>

        <View
          style={styles.card}
        >
          <Text
            style={
              styles.sectionTitle
            }
          >
            STATUS DO PERFIL
          </Text>

          <View
            style={
              styles.switchRow
            }
          >
            <View
              style={
                styles.switchTextArea
              }
            >
              <Text
                style={
                  styles.switchTitle
                }
              >
                Perfil ativo
              </Text>

              <Text
                style={
                  styles.switchDescription
                }
              >
                Quando desativado, o
                perfil permanece salvo
                mas fica marcado como
                inativo.
              </Text>
            </View>

            <Switch
              value={active}
              onValueChange={
                setActive
              }
              disabled={saving}
            />
          </View>
        </View>

        {!!errorMessage && (
          <View
            style={
              styles.errorCard
            }
          >
            <Text
              style={
                styles.errorText
              }
            >
              {errorMessage}
            </Text>
          </View>
        )}

        {!!successMessage && (
          <View
            style={
              styles.successCard
            }
          >
            <Text
              style={
                styles.successText
              }
            >
              {successMessage}
            </Text>
          </View>
        )}

        <Pressable
          style={({ pressed }) => [
            styles.primaryButton,
            (pressed || saving) &&
              styles.buttonPressed,
          ]}
          onPress={() =>
            handleSave(false)
          }
          disabled={saving}
        >
          <Text
            style={
              styles.primaryButtonText
            }
          >
            {saving
              ? 'Salvando...'
              : 'Salvar e voltar'}
          </Text>
        </Pressable>

        <Pressable
          style={({ pressed }) => [
            styles.secondaryButton,
            (pressed || saving) &&
              styles.buttonPressed,
          ]}
          onPress={() =>
            handleSave(true)
          }
          disabled={saving}
        >
          <Text
            style={
              styles.secondaryButtonText
            }
          >
            Salvar e continuar
          </Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles =
  StyleSheet.create({
    page: {
      flex: 1,
      backgroundColor: '#242824',
    },

    content: {
      width: '100%',
      maxWidth: 620,
      alignSelf: 'center',
      paddingHorizontal: 20,
      paddingTop: 40,
      paddingBottom: 70,
    },

    loading: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 30,
      backgroundColor: '#242824',
    },

    loadingText: {
      marginTop: 10,
      fontSize: 13,
      color: '#C0C7C1',
    },

    topBar: {
      marginBottom: 18,
    },

    brand: {
      fontSize: 24,
      fontWeight: '800',
      letterSpacing: 2,
      color: '#F2F3EF',
    },

    brandSubtitle: {
      marginTop: 2,
      fontSize: 9,
      fontWeight: '700',
      letterSpacing: 1.6,
      color: '#74B892',
    },

    backButton: {
      alignSelf: 'flex-start',
      marginBottom: 22,
      paddingHorizontal: 14,
      paddingVertical: 9,
      borderWidth: 1,
      borderColor: '#687069',
      borderRadius: 999,
      backgroundColor: '#2E332F',
    },

    backButtonText: {
      fontSize: 13,
      fontWeight: '700',
      color: '#F2F3EF',
    },

    eyebrow: {
      fontSize: 10,
      fontWeight: '800',
      letterSpacing: 1.2,
      color: '#FFB04A',
    },

    title: {
      marginTop: 4,
      fontSize: 30,
      lineHeight: 36,
      fontWeight: '800',
      color: '#F2F3EF',
    },

    subtitle: {
      marginTop: 7,
      marginBottom: 20,
      fontSize: 13,
      lineHeight: 19,
      color: '#C0C7C1',
    },

    card: {
      marginBottom: 14,
      padding: 18,
      borderWidth: 1,
      borderColor: '#4C534D',
      borderRadius: 18,
      backgroundColor: '#2E332F',
    },

    sectionTitle: {
      marginBottom: 14,
      fontSize: 10,
      fontWeight: '800',
      letterSpacing: 1.2,
      color: '#74B892',
    },

    label: {
      marginBottom: 7,
      fontSize: 11,
      fontWeight: '800',
      color: '#626A6F',
    },

    input: {
      minHeight: 48,
      marginBottom: 15,
      paddingHorizontal: 13,
      paddingVertical: 12,
      borderWidth: 1,
      borderColor: '#687069',
      borderRadius: 12,
      backgroundColor: '#383E39',
      fontSize: 14,
      color: '#F2F3EF',
    },

    textArea: {
      minHeight: 105,
    },

    smallTextArea: {
      minHeight: 80,
    },

    helperText: {
      marginTop: -7,
      fontSize: 10,
      lineHeight: 15,
      color: '#92979A',
    },

    switchRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent:
        'space-between',
      gap: 15,
    },

    switchTextArea: {
      flex: 1,
    },

    switchTitle: {
      fontSize: 14,
      fontWeight: '800',
      color: '#F2F3EF',
    },

    switchDescription: {
      marginTop: 4,
      fontSize: 11,
      lineHeight: 16,
      color: '#858B8F',
    },

    primaryButton: {
      minHeight: 54,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 14,
      backgroundColor:
        '#E07A3A',
    },

    primaryButtonText: {
      fontSize: 14,
      fontWeight: '800',
      color: '#FFFFFF',
    },

    secondaryButton: {
      minHeight: 52,
      marginTop: 10,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: '#687069',
      borderRadius: 14,
      backgroundColor: '#2E332F',
    },

    secondaryButtonText: {
      fontSize: 14,
      fontWeight: '800',
      color: '#F2F3EF',
    },

    buttonPressed: {
      opacity: 0.65,
    },

    errorCard: {
      marginBottom: 14,
      padding: 14,
      borderRadius: 12,
      backgroundColor:
        '#4A2F2D',
    },

    errorText: {
      fontSize: 13,
      lineHeight: 19,
      color: '#FF8D83',
    },

    successCard: {
      marginBottom: 14,
      padding: 14,
      borderRadius: 12,
      backgroundColor: '#383E39',
    },

    successText: {
      fontSize: 13,
      lineHeight: 19,
      color: '#506455',
    },

    coverMedia: { height: 138, marginBottom: 0, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', borderRadius: 17, backgroundColor: '#383E39' },
    logoMedia: { width: 88, height: 88, marginTop: -42, marginLeft: 18, marginBottom: 16, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', borderWidth: 4, borderColor: '#242824', borderRadius: 22, backgroundColor: '#D7A84B' },
    mediaImage: { width: '100%', height: '100%' },
    mediaPlaceholder: { fontSize: 12, fontWeight: '800', color: '#74B892' },
    mediaAction: { position: 'absolute', right: 9, bottom: 9, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 9, overflow: 'hidden', fontSize: 10, fontWeight: '900', color: '#FFFFFF', backgroundColor: 'rgba(0,0,0,.55)' },
    logoPlaceholderText: { fontSize: 30, fontWeight: '900', color: '#242824' },
    logoAction: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingVertical: 5, textAlign: 'center', fontSize: 8, fontWeight: '900', color: '#FFFFFF', backgroundColor: 'rgba(0,0,0,.55)' },

    returnButton: {
      marginTop: 18,
      paddingHorizontal: 20,
      paddingVertical: 12,
      borderRadius: 12,
      backgroundColor:
        '#2C343A',
    },

    returnButtonText: {
      fontSize: 13,
      fontWeight: '800',
      color: '#FFFFFF',
    },
  });
