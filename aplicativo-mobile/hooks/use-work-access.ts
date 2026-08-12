import {
    useCallback,
    useEffect,
    useState,
} from 'react';

import { supabase } from '@/lib/supabase';

export type WorkAccessLevel =
  | 'owner'
  | 'manager'
  | 'collaborator'
  | 'viewer';

type CurrentWorkParticipant = {
  user_id: string;
  access_level: WorkAccessLevel;
  is_current_user: boolean;
};

export function useWorkAccess(
  workId?: string | null
) {
  const [
    accessLevel,
    setAccessLevel,
  ] = useState<
    WorkAccessLevel | null
  >(null);

  const [
    userId,
    setUserId,
  ] = useState<string | null>(
    null
  );

  const [
    loadingAccess,
    setLoadingAccess,
  ] = useState(false);

  const [
    accessError,
    setAccessError,
  ] = useState('');

  const loadAccess =
    useCallback(async () => {
      if (!workId) {
        setAccessLevel(null);
        setUserId(null);
        setAccessError('');
        setLoadingAccess(false);
        return;
      }

      setLoadingAccess(true);
      setAccessError('');

      try {
        const { data, error } =
          await supabase.rpc(
            'get_work_participants',
            {
              p_work_id: workId,
            }
          );

        if (error) {
          setAccessLevel(null);
          setUserId(null);
          setAccessError(
            error.message
          );
          return;
        }

        const participants =
          (data ?? []) as
            CurrentWorkParticipant[];

        const current =
          participants.find(
            (participant) =>
              participant
                .is_current_user
          );

        setAccessLevel(
          current?.access_level ??
            null
        );

        setUserId(
          current?.user_id ??
            null
        );
      } catch (error) {
        setAccessLevel(null);
        setUserId(null);

        setAccessError(
          error instanceof Error
            ? error.message
            : 'Não foi possível carregar sua permissão nesta obra.'
        );
      } finally {
        setLoadingAccess(false);
      }
    }, [workId]);

  useEffect(() => {
    loadAccess();
  }, [loadAccess]);

  const canManage =
    accessLevel === 'owner' ||
    accessLevel === 'manager';

  const canWrite =
    canManage ||
    accessLevel ===
      'collaborator';

  const isViewer =
    accessLevel === 'viewer';

  return {
    accessLevel,
    userId,
    canManage,
    canWrite,
    isViewer,
    loadingAccess,
    accessError,
    reloadAccess: loadAccess,
  };
}
