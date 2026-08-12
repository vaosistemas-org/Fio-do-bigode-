import {
    Image,
    StyleSheet,
    Text,
    View,
} from 'react-native';

type ProfessionalMiniProfileProps = {
  name: string;
  avatarUrl?: string | null;
  role?: string | null;
  detail?: string | null;
};

function getInitials(name: string) {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (parts.length === 0) {
    return 'F';
  }

  if (parts.length === 1) {
    return parts[0]
      .charAt(0)
      .toUpperCase();
  }

  return `${parts[0].charAt(
    0
  )}${parts[
    parts.length - 1
  ].charAt(0)}`.toUpperCase();
}

export default function ProfessionalMiniProfile({
  name,
  avatarUrl,
  role,
  detail,
}: ProfessionalMiniProfileProps) {
  return (
    <View style={styles.container}>
      {avatarUrl ? (
        <Image
          source={{
            uri: avatarUrl,
          }}
          style={styles.avatar}
        />
      ) : (
        <View
          style={
            styles.avatarPlaceholder
          }
        >
          <Text
            style={
              styles.avatarInitials
            }
          >
            {getInitials(name)}
          </Text>
        </View>
      )}

      <Text
        style={styles.name}
        numberOfLines={2}
      >
        {name}
      </Text>

      {!!role && (
        <Text
          style={styles.role}
          numberOfLines={1}
        >
          {role}
        </Text>
      )}

      {!!detail && (
        <Text
          style={styles.detail}
          numberOfLines={1}
        >
          {detail}
        </Text>
      )}
    </View>
  );
}

const styles =
  StyleSheet.create({
    container: {
      width: '100%',
      alignItems: 'center',
    },

    avatar: {
      width: 48,
      height: 48,
      borderRadius: 24,
      backgroundColor:
        '#ECEEEC',
    },

    avatarPlaceholder: {
      width: 48,
      height: 48,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 24,
      backgroundColor:
        '#2C343A',
    },

    avatarInitials: {
      fontSize: 14,
      fontWeight: '800',
      color: '#FFFFFF',
    },

    name: {
      marginTop: 7,
      fontSize: 13,
      lineHeight: 16,
      fontWeight: '800',
      textAlign: 'center',
      color: '#2C343A',
    },

    role: {
      marginTop: 3,
      fontSize: 10,
      fontWeight: '700',
      textAlign: 'center',
      color: '#5F7567',
    },

    detail: {
      marginTop: 2,
      fontSize: 9,
      textAlign: 'center',
      color: '#8B9195',
    },
  });
