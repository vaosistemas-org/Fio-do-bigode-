import { createClient } from 'npm:@supabase/supabase-js@2.112.2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const url = new URL(request.url);
    const token = url.searchParams.get('token');
    const kind = url.searchParams.get('kind');
    const fileId = url.searchParams.get('id');

    if (!token || !fileId || !['document', 'photo'].includes(kind ?? '')) {
      return json({ error: 'Solicitacao invalida.' }, 400);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !serviceKey) {
      throw new Error('Configuracao do servidor indisponivel.');
    }

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: link, error: linkError } = await admin
      .from('work_general_links')
      .select('work_id, expires_at')
      .eq('token', token)
      .eq('active', true)
      .maybeSingle();

    if (
      linkError ||
      !link ||
      (link.expires_at && new Date(link.expires_at).getTime() <= Date.now())
    ) {
      return json({ error: 'Link expirado ou revogado.' }, 404);
    }

    let bucket = '';
    let storagePath = '';
    let fileName: string | null = null;
    let allowDownload = false;

    if (kind === 'document') {
      const { data: version, error } = await admin
        .from('work_document_versions')
        .select(`
          id, version_number, storage_path, file_name,
          work_documents!inner(work_id, visibility, active, allow_download, current_version)
        `)
        .eq('id', fileId)
        .eq('work_documents.work_id', link.work_id)
        .eq('work_documents.visibility', 'fio_general')
        .eq('work_documents.active', true)
        .maybeSingle();
      if (error || !version) return json({ error: 'Documento indisponivel.' }, 404);

      const document = Array.isArray(version.work_documents)
        ? version.work_documents[0]
        : version.work_documents;
      if (!document || version.version_number !== document.current_version) {
        return json({ error: 'Documento indisponivel.' }, 404);
      }

      bucket = 'work-documents';
      storagePath = version.storage_path;
      fileName = version.file_name;
      allowDownload = Boolean(document.allow_download);
    } else {
      const { data: photo, error } = await admin
        .from('work_photos')
        .select('storage_path, file_name')
        .eq('id', fileId)
        .eq('work_id', link.work_id)
        .eq('visibility', 'shared')
        .maybeSingle();
      if (error || !photo) return json({ error: 'Foto indisponivel.' }, 404);

      bucket = 'work-photos';
      storagePath = photo.storage_path;
      fileName = photo.file_name;
    }

    const { data: signed, error: signError } = await admin.storage
      .from(bucket)
      .createSignedUrl(storagePath, 60 * 5);
    if (signError || !signed?.signedUrl) {
      return json({ error: 'Arquivo indisponivel.' }, 404);
    }

    return json({
      url: signed.signedUrl,
      fileName,
      allowDownload,
      expiresIn: 300,
    });
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : 'Erro inesperado.' },
      500
    );
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
