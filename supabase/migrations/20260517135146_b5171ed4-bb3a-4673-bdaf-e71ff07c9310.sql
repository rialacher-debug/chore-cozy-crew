
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.is_family_member(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_family_member(uuid, uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.get_invite_info(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_invite_info(text) TO anon, authenticated;
REVOKE ALL ON FUNCTION public.accept_invite(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_invite(text, text) TO authenticated;
