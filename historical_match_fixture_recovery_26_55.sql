begin;

-- REVIEW-ONLY ARTIFACT. Do not run without a separately approved database change.
-- Source: Match Play .xlsx
-- SHA-256: 11517EE0CE3AA042AEB0F2D9DD070F1E7301B9CA54B8A18F08D8868C671FCC46
-- Scope: 20 source-proven Season 46 fixtures and 20 source-proven Season 53 fixtures.

do $recovery$
declare
  v record;
  v_import_id uuid;
  v_player1_id uuid;
  v_player2_id uuid;
  v_count integer;
  v_existing public.historical_match_fixtures%rowtype;
begin
  for v in
    select *
    from (values
      (46, 1, 1, 'TETHYS EASY', 2, 'KEIRAROBERT', 1, 1, 'SLAPPY', 7, '46sc/image25.png#03ED7B6A9EE13AF81E38E36E1F10A884E5455CAF20841A89A72106E75D396EB0'),
      (46, 1, 1, 'TETHYS EASY', 3, 'CHIPNPUTT', 7, 4, 'DBK', 3, '46sc/image38.png#88333EA3BC26C63C8E3D1A735C9120631F3302EA4DE797F2B714404E992F2724'),
      (46, 2, 1, 'TETHYS EASY', 1, 'EMPZURG', 9, 2, 'SANDTRAP', 4, '46sc/image33.png#06DE7103FA41FB6BC75CB7EFD40B9F6BCA51415FC8555EF252FFF85330F1DC91'),
      (46, 2, 1, 'TETHYS EASY', 4, 'MUSICAL_ATV', 4, 3, 'EARTHING', 9, '46sc/image35.png#C662EBB44E1510A61C97A8E8F6EE3F2256B6BB19A85193FA03430A296D36C285'),
      (46, 3, 1, 'TETHYS EASY', 3, 'KD', 4, 2, 'SJ', 7, '46sc/image24.png#E5D62DF7DCFEAA3E8C841E95089818940DD7A49DA3A1FCD49E2345365082B482'),
      (46, 3, 1, 'TETHYS EASY', 1, 'JFITZ', 6, 4, 'WENDY', 3, '46sc/image29.png#A8643527B74AF38C48C618FE200155D0FE77AE178CD3500A90D5456D2E154C3A'),
      (46, 4, 1, 'TETHYS EASY', 2, 'RAY-OF-SUNSHINE', 6, 3, 'DARLAVA', 7, '46sc/image26.png#8A5F337BA7C264DC3663860A61AB8B64788F73786FA7A6068F08C259F1B2FF61'),
      (46, 4, 1, 'TETHYS EASY', 1, 'EXNY-AMYB', 8, 4, 'SARAHLYNN', 2, '46sc/image36.png#3206797C6690DF1C36EB586874D608098AABED5AF5740DD69F7E4B002F962053'),
      (46, 1, 2, 'HOLIDAY HARD', 2, 'KEIRAROBERT', 6, 4, 'DBK', 4, '46sc/image22.png#3757472A1AAC0E151047FFBC1712A1E4584AF9C4946102AFA1A1155176534DAD'),
      (46, 1, 2, 'HOLIDAY HARD', 3, 'CHIPNPUTT', 4, 1, 'SLAPPY', 8, '46sc/image27.png#B54AD71314D82FBD78F589C77B3C7F40C2DDDB97867E8B82F402260582F6E16F'),
      (46, 2, 2, 'HOLIDAY HARD', 4, 'MUSICAL_ATV', 3, 2, 'SANDTRAP', 10, '46sc/image30.png#9B2570B63D3AD0326EAC49423D8DB85A925F219D91E4E50B702E550A81B0D2AD'),
      (46, 3, 2, 'HOLIDAY HARD', 1, 'JFITZ', 9, 3, 'KD', 4, '46sc/image28.png#1A132A158D99322D2045D896D7C13AC875B73ACACF5877C899929E30CD33BAB4'),
      (46, 3, 2, 'HOLIDAY HARD', 2, 'SJ', 7, 4, 'WENDY', 5, '46sc/image32.png#FF0E7D4882B0E54F0E2BD10603DC25E16899E7185EEEE4E3F91EF9CE3C3BD74E'),
      (46, 4, 2, 'HOLIDAY HARD', 3, 'DARLAVA', 7, 1, 'EXNY-AMYB', 9, '46sc/image37.png#D839F81986B6A273CE7A179D26F550659CA465FA44ACDB72A061942BCFFA1BFA'),
      (46, 1, 3, 'CRYSTAL EASY', 3, 'CHIPNPUTT', 6, 2, 'KEIRAROBERT', 7, '46sc/image31.png#61C174D30E66844840F2096DF203AF2827CF5016D37691ED9DC837675D336CB9'),
      (46, 2, 3, 'CRYSTAL EASY', 4, 'MUSICAL_ATV', 5, 1, 'EMPZURG', 7, '46sc/image34.png#8677D898C3A65FE0B349AED89FA8129625B760209ED6F010DE569C5D4706AD61'),
      (46, 3, 3, 'CRYSTAL EASY', 3, 'KD', 6, 4, 'WENDY', 4, '46sc/image39.png#5580BD96CD8699B64190938570FCCAE3B917AC62016B945C7079AA5E840E2E8E'),
      (46, 3, 3, 'CRYSTAL EASY', 1, 'JFITZ', 8, 2, 'SJ', 4, '46sc/image40.png#32F001E59497BACE7EF1904E6A0592C054683E118D38C79DDD0FEE95438A4DC8'),
      (46, 4, 3, 'CRYSTAL EASY', 4, 'SARAHLYNN', 9, 3, 'DARLAVA', 3, '46sc/image21.png#F86CAD01700BB65057F39E853419AC9E80AD0D846309FC7E5DF9B188C99260FC'),
      (46, 4, 3, 'CRYSTAL EASY', 1, 'EXNY-AMYB', 9, 2, 'RAY-OF-SUNSHINE', 6, '46sc/image23.png#D6A785201B3C798A142C42F2B6383FCEC689B69DDC97BA2085E89FF8D2902819'),
      (53, 1, 1, '8BIT EASY', 4, 'SARAHLYNN', 5, 1, 'CHIPNPUTT', 6, '53sc/image11.png#1191B6AEEC04F5CF7A7123B8B396E396F5A030A11D8FDCE31CF18B6163C916F4'),
      (53, 2, 1, '8BIT EASY', 1, 'FORE FUN', 4, 2, 'SPICY', 4, '53sc/image1.png#6C228E08A0F99D956254429CF9F4ED866DD3FF1823397FDA1394FE7676535ED6'),
      (53, 2, 1, '8BIT EASY', 3, 'EMPZURG', 10, 4, 'KD', 4, '53sc/image17.png#8BDA1569B5055BBA83213F13A3DA8EF00FEE66FAD8DBBF62B2C08B098DB3C13C'),
      (53, 3, 1, '8BIT EASY', 3, 'DANWOLVES', 3, 1, 'WAREY', 7, '53sc/image7.png#F231C54BD178D7A3926D3C3EDE26ACC7FE216BDF0DF45B9E1EA931FC20EECE78'),
      (53, 4, 1, '8BIT EASY', 4, 'WENDY', 2, 1, 'THE REAL JB', 7, '53sc/image10.png#17D3F242DF93C853C50030F8040BE3363F20C221608B4351FBB1880AF5A74309'),
      (53, 5, 1, '8BIT EASY', 3, 'AUDREY', 4, 1, 'ALYSSA38', 8, '53sc/image6.png#11FE8C17F87ECE45928F7531C02DD3BBEA31B0453569E8098407E11E4C07578A'),
      (53, 1, 2, 'TOKYO HARD', 1, 'CHIPNPUTT', 5, 2, 'SLAPPY', 8, '53sc/image15.png#2A48810AEF3119101C937400E587E95573BE8C68BFF763CE0C5C212039DFF444'),
      (53, 2, 2, 'TOKYO HARD', 4, 'KD', 6, 2, 'SPICY', 8, '53sc/image8.png#75B96D8685390B922512E3152CBBF634EF60DE84E3DD168F6614FC2DF9BA5D63'),
      (53, 2, 2, 'TOKYO HARD', 1, 'FORE FUN', 8, 3, 'EMPZURG', 3, '53sc/image18.png#FE5BE6E070BE4735C0B1B050F847172C963C7C930B27CE7178514DE5DA8604E3'),
      (53, 3, 2, 'TOKYO HARD', 2, 'GREATSEER', 2, 1, 'WAREY', 7, '53sc/image4.png#EA702ABC49F4CB539E9F043E01D4ED09A12ECCBD38D4A6A1658856E68F8E1E03'),
      (53, 4, 2, 'TOKYO HARD', 1, 'THE REAL JB', 5, 3, 'SLUGJUG', 4, '53sc/image2.png#0158C7FF5725656A3FB64C4A1F283ECCA5DCD90998DF28B09931990D4FA1D4B5'),
      (53, 4, 2, 'TOKYO HARD', 4, 'WENDY', 3, 2, 'SHAHOOFNA', 8, '53sc/image9.png#AC14DCD04BA7B71AC1EB867B3914CB0F7A7D0E67D277D85962A7C012C56C8243'),
      (53, 5, 2, 'TOKYO HARD', 1, 'ALYSSA38', 8, 2, 'ZOEDARLIN', 5, '53sc/image19.png#58D503E478337FA025B8A88B2B5FDF1EDA76285292FA201428D65363869CD664'),
      (53, 1, 3, 'VENICE EASY', 3, 'KEIRAROBERT', 6, 1, 'CHIPNPUTT', 4, '53sc/image12.png#F76B53EB3E6917AA7DF4803495D82242178B84857D40CD2876F15A8AF9ED04C5'),
      (53, 2, 3, 'VENICE EASY', 3, 'EMPZURG', 2, 2, 'SPICY', 5, '53sc/image3.png#A1F8A160D5ED0231A55CB18CA8C337EFE085EDA6C7EB8838A0E34AB9849564F8'),
      (53, 2, 3, 'VENICE EASY', 4, 'KD', 3, 1, 'FORE FUN', 7, '53sc/image20.png#3C9AC29611E705DD9C2BB9A696677F909A22F0986F89A70FA7FDAA87D1605B44'),
      (53, 3, 3, 'VENICE EASY', 3, 'DANWOLVES', 5, 2, 'GREATSEER', 6, '53sc/image13.png#6B033D7D57433388924CF0B32009FBF8159C9AACAB49DB5B1DAA6A17F139520B'),
      (53, 4, 3, 'VENICE EASY', 3, 'SLUGJUG', 6, 4, 'WENDY', 4, '53sc/image5.png#7C0AD603CB29CF5E1DCBDE01110DAF72C6993E001427A093D1FEBC2861454FA0'),
      (53, 4, 3, 'VENICE EASY', 1, 'THE REAL JB', 4, 2, 'SHAHOOFNA', 3, '53sc/image16.png#79344A5CD53A658D38E554F6563C8C0A76CF96129D8768D70C28C25AF370D1FA'),
      (53, 5, 3, 'VENICE EASY', 3, 'AUDREY', 2, 2, 'ZOEDARLIN', 6, '53sc/image14.png#78A5CE403E9F6C50D94C5FFE4AB93951CAB345B3A2ED2B660CD9926CC86A04EA')
    ) as fixture(
      season_number, division_number, course_order, course_name,
      player1_final_rank, player1_historical_name, player1_holes_won,
      player2_final_rank, player2_historical_name, player2_holes_won,
      source_reference
    )
  loop
    if v.season_number < 26 or v.season_number > 55 then
      raise exception 'Recovery row targets unauthorized Season %', v.season_number;
    end if;
    if lower(v.player1_historical_name) = 'bye' or lower(v.player2_historical_name) = 'bye' then
      raise exception 'BYE cannot be imported as a historical fixture participant';
    end if;

    select count(*), (array_agg(source.id))[1]
      into v_count, v_import_id
    from public.historical_match_imports as source
    where source.season_number = v.season_number;
    if v_count <> 1 then
      raise exception 'Season % must resolve to exactly one historical Match import; found %', v.season_number, v_count;
    end if;

    select count(*), (array_agg(standing.id))[1]
      into v_count, v_player1_id
    from public.historical_match_standings as standing
    where standing.historical_match_import_id = v_import_id
      and standing.division_number = v.division_number
      and standing.source_final_rank = v.player1_final_rank
      and lower(regexp_replace(btrim(standing.historical_display_name), '[^a-z0-9]+', '', 'g')) =
          lower(regexp_replace(btrim(v.player1_historical_name), '[^a-z0-9]+', '', 'g'));
    if v_count <> 1 then
      raise exception 'Season % D% rank % does not uniquely match preserved name %',
        v.season_number, v.division_number, v.player1_final_rank, v.player1_historical_name;
    end if;

    select count(*), (array_agg(standing.id))[1]
      into v_count, v_player2_id
    from public.historical_match_standings as standing
    where standing.historical_match_import_id = v_import_id
      and standing.division_number = v.division_number
      and standing.source_final_rank = v.player2_final_rank
      and lower(regexp_replace(btrim(standing.historical_display_name), '[^a-z0-9]+', '', 'g')) =
          lower(regexp_replace(btrim(v.player2_historical_name), '[^a-z0-9]+', '', 'g'));
    if v_count <> 1 then
      raise exception 'Season % D% rank % does not uniquely match preserved name %',
        v.season_number, v.division_number, v.player2_final_rank, v.player2_historical_name;
    end if;

    perform pg_advisory_xact_lock(hashtextextended(
      'historical_match_fixture:' || v_import_id::text || ':' ||
      v.division_number::text || ':' || v.course_order::text,
      0
    ));

    select existing.* into v_existing
    from public.historical_match_fixtures as existing
    where existing.historical_match_import_id = v_import_id
      and existing.division_number = v.division_number
      and existing.course_order = v.course_order
      and least(existing.player1_standing_id, existing.player2_standing_id) = least(v_player1_id, v_player2_id)
      and greatest(existing.player1_standing_id, existing.player2_standing_id) = greatest(v_player1_id, v_player2_id);

    if v_existing.id is not null then
      if v_existing.historical_course_name <> v.course_name
         or not v_existing.played
         or case when v_existing.player1_standing_id = v_player1_id
              then v_existing.player1_holes_won <> v.player1_holes_won or v_existing.player2_holes_won <> v.player2_holes_won
              else v_existing.player1_holes_won <> v.player2_holes_won or v_existing.player2_holes_won <> v.player1_holes_won
            end then
        raise exception 'Existing fixture conflicts with recovered source evidence for Season % D% course %',
          v.season_number, v.division_number, v.course_order;
      end if;
      continue;
    end if;

    if exists (
      select 1
      from public.historical_match_fixtures as existing
      where existing.historical_match_import_id = v_import_id
        and existing.division_number = v.division_number
        and existing.course_order = v.course_order
        and (existing.player1_standing_id in (v_player1_id, v_player2_id)
          or existing.player2_standing_id in (v_player1_id, v_player2_id))
    ) then
      raise exception 'A recovered player already appears in another fixture for this course (Season % D% course %)',
        v.season_number, v.division_number, v.course_order;
    end if;

    insert into public.historical_match_fixtures(
      historical_match_import_id,
      division_number,
      course_order,
      historical_course_name,
      player1_standing_id,
      player2_standing_id,
      played,
      player1_holes_won,
      player2_holes_won,
      source_reference
    ) values (
      v_import_id,
      v.division_number,
      v.course_order,
      v.course_name,
      v_player1_id,
      v_player2_id,
      true,
      v.player1_holes_won,
      v.player2_holes_won,
      'Match Play .xlsx#' || v.source_reference
    );
  end loop;
end;
$recovery$;

commit;
