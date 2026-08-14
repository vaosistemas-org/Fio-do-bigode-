export type WorkAccessLevel =
  | 'owner'
  | 'manager'
  | 'collaborator'
  | 'viewer';

export type Work = {
  id: string;
  code: string;
  client_name: string;
  client_phone: string;
  address: string;
  project_order: string | null;
  status: string;
  progress: number;
  next_visit_at: string | null;
  notes: string | null;
  updated_at: string;
};

export type WorkEnvironment = {
  id: string;
  work_id: string;
  name: string;
  status:
    | 'nao_iniciado'
    | 'em_andamento'
    | 'aguardando'
    | 'concluido'
    | 'cancelado';
  progress: number;
  responsible_user_id: string | null;
  installation_priority: boolean;
  preparation_min_photos: number;
  active: boolean;
  created_at: string;
};

export type WorkParticipant = {
  participant_id: string;
  user_id: string;
  full_name: string;
  job_title: string | null;
  avatar_url: string | null;
  role_title: string | null;
  access_level: WorkAccessLevel;
  company_id: string | null;
  company_name: string | null;
  is_current_user: boolean;
  joined_at: string;
};

export type WorkSectionKey =
  | 'environments'
  | 'pending'
  | 'fio'
  | 'photos'
  | 'measurements'
  | 'documents';
