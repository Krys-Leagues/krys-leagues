-- Official Gardens of Babylon par cards supplied by the tournament owner.
-- Reconfigures only the MGA Scoring Studio rounds and recalculates Studio
-- score-to-par values without changing any stroke totals or legacy MGA records.

do $apply_official_pars$
declare
  v_instance uuid;
  v_easy integer[]:=array[2,3,3,4,3,5,2,3,6,3,4,4,3,4,3,3,3,3];
  v_hard integer[]:=array[3,3,4,3,4,6,3,3,3,4,4,4,3,3,3,3,4,4];
  v_round_count integer;
  v_score record;
  v_new_to_par integer;
  v_old_state jsonb;
begin
  select i.id into v_instance
  from public.scoring_studio_instances i
  where i.slug='mga-championship-2026'
    and i.name ilike '%MGA Championship%'
  for update;
  if v_instance is null then raise exception 'MGA scoring instance was not found; official par setup stopped'; end if;

  select count(*) into v_round_count
  from public.scoring_studio_rounds r
  where r.instance_id=v_instance and r.course_name='Gardens of Babylon' and r.round_number between 1 and 4;
  if v_round_count<>4 then raise exception 'Expected four Gardens of Babylon Studio rounds; official par setup stopped'; end if;

  update public.scoring_studio_rounds r
  set difficulty=case when r.round_number<=2 then 'easy' else 'hard' end,
      par_by_hole=case when r.round_number<=2 then v_easy else v_hard end
  where r.instance_id=v_instance and r.course_name='Gardens of Babylon' and r.round_number between 1 and 4;

  for v_score in
    select s.id,s.round_id,s.canonical_player_id,s.score_kind,s.total_strokes,s.score_to_par,
      s.hole_strokes,r.par_by_hole
    from public.scoring_studio_scores s
    join public.scoring_studio_rounds r on r.id=s.round_id and r.instance_id=s.instance_id
    where s.instance_id=v_instance and r.round_number between 1 and 4
  loop
    v_new_to_par:=public.scoring_studio_hole_to_par(v_score.total_strokes,v_score.hole_strokes,v_score.par_by_hole);
    if v_new_to_par is distinct from v_score.score_to_par then
      v_old_state:=jsonb_build_object('score_kind',v_score.score_kind,'total_strokes',v_score.total_strokes,
        'score_to_par',v_score.score_to_par,'hole_strokes',v_score.hole_strokes);
      update public.scoring_studio_scores set score_to_par=v_new_to_par,updated_at=now()
      where id=v_score.id;
      insert into public.scoring_studio_audit_log(instance_id,round_id,canonical_player_id,entity_type,entity_id,action,before_state,after_state,actor_user_id)
      values(v_instance,v_score.round_id,v_score.canonical_player_id,'score',v_score.id,'course_par_corrected',v_old_state,
        jsonb_build_object('score_kind',v_score.score_kind,'total_strokes',v_score.total_strokes,
          'score_to_par',v_new_to_par,'hole_strokes',v_score.hole_strokes),auth.uid());
    end if;
  end loop;
end;
$apply_official_pars$;

do $verify_official_pars$
declare
  v_instance uuid;
  v_easy integer[]:=array[2,3,3,4,3,5,2,3,6,3,4,4,3,4,3,3,3,3];
  v_hard integer[]:=array[3,3,4,3,4,6,3,3,3,4,4,4,3,3,3,3,4,4];
begin
  select id into v_instance from public.scoring_studio_instances where slug='mga-championship-2026';
  if exists(select 1 from public.scoring_studio_rounds r where r.instance_id=v_instance and r.round_number in (1,2) and (r.difficulty<>'easy' or r.par_by_hole<>v_easy or public.scoring_studio_array_sum(r.par_by_hole)<>61)) then
    raise exception 'Easy par-card verification failed';
  end if;
  if exists(select 1 from public.scoring_studio_rounds r where r.instance_id=v_instance and r.round_number in (3,4) and (r.difficulty<>'hard' or r.par_by_hole<>v_hard or public.scoring_studio_array_sum(r.par_by_hole)<>64)) then
    raise exception 'Hard par-card verification failed';
  end if;
end;
$verify_official_pars$;
