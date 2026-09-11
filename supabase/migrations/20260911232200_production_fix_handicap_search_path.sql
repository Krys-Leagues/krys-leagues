-- Production security fix: make the existing calculation/trigger search paths explicit.
-- Function bodies and handicap/score semantics are unchanged.

alter function public.rebuild_course_ratings()
  set search_path = public, extensions;

alter function public.rebuild_handicap_differentials()
  set search_path = public, extensions;

alter function public.rebuild_handicap_index()
  set search_path = public, extensions;

alter function public.set_updated_at()
  set search_path = '';
