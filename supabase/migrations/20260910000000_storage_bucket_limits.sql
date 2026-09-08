-- Security audit finding (BACKEND-PLAN.md "Security plan", Medium):
-- the bills/cvs/avatars buckets had no file_size_limit or
-- allowed_mime_types set — the accept="..." attributes on the upload
-- inputs (dashboard/page.tsx, ApplyForm.tsx, ProfileForm.tsx) are
-- client-side hints only, trivially bypassed. Values below match what
-- each upload UI already claims to accept, so nothing legitimate
-- changes — this only stops what was never supposed to be uploadable in
-- the first place.
update storage.buckets
set
  file_size_limit = 10485760, -- 10MB, matches a scanned medical bill
  allowed_mime_types = array['application/pdf', 'image/png', 'image/jpeg']
where id = 'bills';

update storage.buckets
set
  file_size_limit = 3145728, -- 3MB — ApplyForm.tsx's own UI copy already says "Max 3MB"
  allowed_mime_types = array[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
where id = 'cvs';

update storage.buckets
set
  file_size_limit = 2097152, -- 2MB, plenty for a profile picture
  allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp', 'image/gif']
where id = 'avatars';
