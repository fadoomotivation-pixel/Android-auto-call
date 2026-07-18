-- The call-recordings bucket was created with a fixed allowed_mime_types list
-- (m4a/wav/mpeg/aac). Budget Android phones' built-in recorders save .amr, .3gp
-- and other containers, which Storage then rejected with
--   "mime type audio/amr is not supported"
-- so those recordings never uploaded. Drop the allow-list: the bucket is private
-- and written ONLY by the recording-upload edge function (service role), which
-- already sniffs the audio's magic bytes before storing. The 50 MB size limit
-- stays as the real guard.
update storage.buckets
set allowed_mime_types = null
where id = 'call-recordings';
