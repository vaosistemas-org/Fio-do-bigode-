import {
    useCallback,
    useState,
} from 'react';

import {
    ActivityIndicator,
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
      backgroundColor:
        '#F7F7F5',
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
      backgroundColor:
        '#F7F7F5',
    },

    loadingText: {
      marginTop: 10,
      fontSize: 13,
      color: '#777D80',
    },

    topBar: {
      marginBottom: 18,
    },

    brand: {
      fontSize: 24,
      fontWeight: '800',
      letterSpacing: 2,
      color: '#2C343A',
    },

    brandSubtitle: {
      marginTop: 2,
      fontSize: 9,
      fontWeight: '700',
      letterSpacing: 1.6,
      color: '#5F7567',
    },

    backButton: {
      alignSelf: 'flex-start',
      marginBottom: 22,
      paddingHorizontal: 14,
      paddingVertical: 9,
      borderWidth: 1,
      borderColor: '#D8DCDA',
      borderRadius: 999,
      backgroundColor:
        '#FFFFFF',
    },

    backButtonText: {
      fontSize: 13,
      fontWeight: '700',
      color: '#2C343A',
    },

    eyebrow: {
      fontSize: 10,
      fontWeight: '800',
      letterSpacing: 1.2,
      color: '#E07A3A',
    },

    title: {
      marginTop: 4,
      fontSize: 30,
      lineHeight: 36,
      fontWeight: '800',
      color: '#2C343A',
    },

    subtitle: {
      marginTop: 7,
      marginBottom: 20,
      fontSize: 13,
      lineHeight: 19,
      color: '#747B80',
    },

    card: {
      marginBottom: 14,
      padding: 18,
      borderWidth: 1,
      borderColor: '#E4E7E4',
      borderRadius: 18,
      backgroundColor:
        '#FFFFFF',
    },

    sectionTitle: {
      marginBottom: 14,
      fontSize: 10,
      fontWeight: '800',
      letterSpacing: 1.2,
      color: '#5F7567',
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
      borderColor: '#DDE1DE',
      borderRadius: 12,
      backgroundColor:
        '#FAFAF8',
      fontSize: 14,
      color: '#2C343A',
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
      color: '#2C343A',
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
      borderColor: '#D8DCDA',
      borderRadius: 14,
      backgroundColor:
        '#FFFFFF',
    },

    secondaryButtonText: {
      fontSize: 14,
      fontWeight: '800',
      color: '#2C343A',
    },

    buttonPressed: {
      opacity: 0.65,
    },

    errorCard: {
      marginBottom: 14,
      padding: 14,
      borderRadius: 12,
      backgroundColor:
        '#FFF2F0',
    },

    errorText: {
      fontSize: 13,
      lineHeight: 19,
      color: '#B42318',
    },

    successCard: {
      marginBottom: 14,
      padding: 14,
      borderRadius: 12,
      backgroundColor:
        '#EEF1ED',
    },

    successText: {
      fontSize: 13,
      lineHeight: 19,
      color: '#506455',
    },

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