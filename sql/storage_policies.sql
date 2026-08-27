-- BioQuest Storage RLS Policies for bioquest-ebooks bucket
-- 在 Supabase Dashboard → SQL Editor 中执行此文件（幂等，可重复执行）
-- 注：PG15 不支持 CREATE POLICY IF NOT EXISTS，用 DO 块按 pg_policies 判重实现幂等

-- 确保存储桶存在
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('bioquest-ebooks', 'bioquest-ebooks', false, 52428800, ARRAY['application/pdf'])
ON CONFLICT (id) DO NOTHING;

-- 更新为允许公开读取（方便前端直接加载 PDF）
UPDATE storage.buckets SET public = true WHERE id = 'bioquest-ebooks';

-- 上传策略（已认证用户）
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                 WHERE schemaname = 'storage' AND tablename = 'objects'
                   AND policyname = 'ebook_upload_auth') THEN
    CREATE POLICY "ebook_upload_auth" ON storage.objects
      FOR INSERT TO authenticated
      WITH CHECK (bucket_id = 'bioquest-ebooks');
  END IF;
END $$;

-- 更新策略（已认证用户，支持 upsert）
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                 WHERE schemaname = 'storage' AND tablename = 'objects'
                   AND policyname = 'ebook_update_auth') THEN
    CREATE POLICY "ebook_update_auth" ON storage.objects
      FOR UPDATE TO authenticated
      USING (bucket_id = 'bioquest-ebooks')
      WITH CHECK (bucket_id = 'bioquest-ebooks');
  END IF;
END $$;

-- 读取策略（所有人，因为 bucket 设为 public）
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                 WHERE schemaname = 'storage' AND tablename = 'objects'
                   AND policyname = 'ebook_read_public') THEN
    CREATE POLICY "ebook_read_public" ON storage.objects
      FOR SELECT TO public
      USING (bucket_id = 'bioquest-ebooks');
  END IF;
END $$;

-- 删除策略（已认证用户）
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                 WHERE schemaname = 'storage' AND tablename = 'objects'
                   AND policyname = 'ebook_delete_auth') THEN
    CREATE POLICY "ebook_delete_auth" ON storage.objects
      FOR DELETE TO authenticated
      USING (bucket_id = 'bioquest-ebooks');
  END IF;
END $$;