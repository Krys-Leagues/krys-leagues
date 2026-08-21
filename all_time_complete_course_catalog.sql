-- Install after all_time_records_generic_course_import.sql. This migration adds
-- catalog rows and historical-workbook aliases only; it never touches records.
do $migration$
declare
  v_catalog jsonb;
begin
  select jsonb_agg(to_jsonb(staged) order by staged.code)
  into v_catalog
  from (values
  ('TTE', 'Tourist Trap', 'Easy', 'Tourist Trap Easy', 'https://objectstorage.us-ashburn-1.oraclecloud.com/n/idw1nygcxpvm/b/wmgt-assets/o/TTE_FULL.jpg', 57, '2020-09-24', 'Tourist Trap'),
  ('TTH', 'Tourist Trap', 'Hard', 'Tourist Trap Hard', 'https://objectstorage.us-ashburn-1.oraclecloud.com/n/idw1nygcxpvm/b/wmgt-assets/o/TTH_FULL.jpg', 61, '2020-09-24', 'Tourist Trap'),
  ('CBE', 'Cherry Blossom', 'Easy', 'Cherry Blossom Easy', 'https://objectstorage.us-ashburn-1.oraclecloud.com/n/idw1nygcxpvm/b/wmgt-assets/o/CBE_FULL.jpg', 63, '2020-09-24', 'Cherry Blossom'),
  ('CBH', 'Cherry Blossom', 'Hard', 'Cherry Blossom Hard', 'https://objectstorage.us-ashburn-1.oraclecloud.com/n/idw1nygcxpvm/b/wmgt-assets/o/CBH_FULL.jpg', 67, '2020-09-24', 'Cherry Blossom'),
  ('SSE', 'Seagull Stacks', 'Easy', 'Seagull Stacks Easy', 'https://objectstorage.us-ashburn-1.oraclecloud.com/n/idw1nygcxpvm/b/wmgt-assets/o/SSE_FULL.jpg', 62, '2020-09-24', 'Seagull Stacks'),
  ('SSH', 'Seagull Stacks', 'Hard', 'Seagull Stacks Hard', 'https://objectstorage.us-ashburn-1.oraclecloud.com/n/idw1nygcxpvm/b/wmgt-assets/o/SSH_FULL.jpg', 67, '2020-09-24', 'Seagull Stacks'),
  ('AME', 'Arizona Modern', 'Easy', 'Arizona Modern Easy', 'https://objectstorage.us-ashburn-1.oraclecloud.com/n/idw1nygcxpvm/b/wmgt-assets/o/AME_FULL.jpg', 66, '2020-09-24', 'Arazona Modern'),
  ('AMH', 'Arizona Modern', 'Hard', 'Arizona Modern Hard', 'https://objectstorage.us-ashburn-1.oraclecloud.com/n/idw1nygcxpvm/b/wmgt-assets/o/AMH_FULL.jpg', 65, '2020-09-24', 'Arazona Modern'),
  ('OGE', 'Original Gothic', 'Easy', 'Original Gothic Easy', 'https://objectstorage.us-ashburn-1.oraclecloud.com/n/idw1nygcxpvm/b/wmgt-assets/o/OGE_FULL.jpg', 54, '2020-11-08', 'Original Gothic'),
  ('OGH', 'Original Gothic', 'Hard', 'Original Gothic Hard', 'https://objectstorage.us-ashburn-1.oraclecloud.com/n/idw1nygcxpvm/b/wmgt-assets/o/OGH_FULL.jpg', 64, '2020-12-27', 'Original Gothic'),
  ('TSE', 'Tethys Station', 'Easy', 'Tethys Station Easy', 'https://objectstorage.us-ashburn-1.oraclecloud.com/n/idw1nygcxpvm/b/wmgt-assets/o/TSE_FULL.jpg', 63, '2021-03-03', 'Tethys Station'),
  ('TSH', 'Tethys Station', 'Hard', 'Tethys Station Hard', 'https://objectstorage.us-ashburn-1.oraclecloud.com/n/idw1nygcxpvm/b/wmgt-assets/o/TSH_FULL.jpg', 64, '2021-03-03', 'Tethys Station'),
  ('BBE', 'Bogey''s Bonanza', 'Easy', 'Bogey''s Bonanza Easy', 'https://objectstorage.us-ashburn-1.oraclecloud.com/n/idw1nygcxpvm/b/wmgt-assets/o/BBE_FULL.jpg', 60, '2021-06-10', 'Bogeys Bonanza'),
  ('BBH', 'Bogey''s Bonanza', 'Hard', 'Bogey''s Bonanza Hard', 'https://objectstorage.us-ashburn-1.oraclecloud.com/n/idw1nygcxpvm/b/wmgt-assets/o/BBH_FULL.jpg', 67, '2021-06-10', 'Bogeys Bonanza'),
  ('QVE', 'Quixote Valley', 'Easy', 'Quixote Valley Easy', 'https://objectstorage.us-ashburn-1.oraclecloud.com/n/idw1nygcxpvm/b/wmgt-assets/o/QVE_FULL.jpg', 54, '2021-09-30', 'Quixote Valley'),
  ('QVH', 'Quixote Valley', 'Hard', 'Quixote Valley Hard', 'https://objectstorage.us-ashburn-1.oraclecloud.com/n/idw1nygcxpvm/b/wmgt-assets/o/QVH_FULL.jpg', 60, '2021-10-07', 'Quixote Valley'),
  ('GBE', 'Gardens of Babylon', 'Easy', 'Gardens of Babylon Easy', 'https://objectstorage.us-ashburn-1.oraclecloud.com/n/idw1nygcxpvm/b/wmgt-assets/o/GBE_FULL.jpg', 61, '2021-11-18', 'Gardens of Babylon'),
  ('GBH', 'Gardens of Babylon', 'Hard', 'Gardens of Babylon Hard', 'https://objectstorage.us-ashburn-1.oraclecloud.com/n/idw1nygcxpvm/b/wmgt-assets/o/GBH_FULL.jpg', 64, '2021-11-18', 'Gardens of Babylon'),
  ('SLE', 'Shangri-La', 'Easy', 'Shangri-La Easy', 'https://objectstorage.us-ashburn-1.oraclecloud.com/n/idw1nygcxpvm/b/wmgt-assets/o/SLE_FULL.jpg', 64, '2021-12-16', 'Shangri La'),
  ('SLH', 'Shangri-La', 'Hard', 'Shangri-La Hard', 'https://objectstorage.us-ashburn-1.oraclecloud.com/n/idw1nygcxpvm/b/wmgt-assets/o/SLH_FULL.jpg', 68, '2021-12-16', 'Shangri La'),
  ('SWE', 'Sweetopia', 'Easy', 'Sweetopia Easy', 'https://objectstorage.us-ashburn-1.oraclecloud.com/n/idw1nygcxpvm/b/wmgt-assets/o/SWE_FULL.jpg', 55, '2022-02-17', 'Sweetopia'),
  ('SWH', 'Sweetopia', 'Hard', 'Sweetopia Hard', 'https://objectstorage.us-ashburn-1.oraclecloud.com/n/idw1nygcxpvm/b/wmgt-assets/o/SWH_FULL.jpg', 59, '2022-02-17', 'Sweetopia'),
  ('EDE', 'El Dorado', 'Easy', 'El Dorado Easy', 'https://objectstorage.us-ashburn-1.oraclecloud.com/n/idw1nygcxpvm/b/wmgt-assets/o/EDE_FULL.jpg', 62, '2022-06-02', 'El Dorado'),
  ('EDH', 'El Dorado', 'Hard', 'El Dorado Hard', 'https://objectstorage.us-ashburn-1.oraclecloud.com/n/idw1nygcxpvm/b/wmgt-assets/o/EDH_FULL.jpg', 61, '2022-06-02', 'El Dorado'),
  ('LBE', 'Labyrinth', 'Easy', 'Labyrinth Easy', 'https://objectstorage.us-ashburn-1.oraclecloud.com/n/idw1nygcxpvm/b/wmgt-assets/o/LBE_FULL.jpg', 64, '2022-07-28', 'Labyrinth'),
  ('LBH', 'Labyrinth', 'Hard', 'Labyrinth Hard', 'https://objectstorage.us-ashburn-1.oraclecloud.com/n/idw1nygcxpvm/b/wmgt-assets/o/LBH_FULL.jpg', 65, '2022-07-28', 'Labyrinth'),
  ('20E', '20,000 Leagues Under The Sea', 'Easy', '20,000 Leagues Under The Sea Easy', 'https://objectstorage.us-ashburn-1.oraclecloud.com/n/idw1nygcxpvm/b/wmgt-assets/o/20E_FULL.jpg', 59, '2022-09-29', '20000 Leagues'),
  ('20H', '20,000 Leagues Under The Sea', 'Hard', '20,000 Leagues Under The Sea Hard', 'https://objectstorage.us-ashburn-1.oraclecloud.com/n/idw1nygcxpvm/b/wmgt-assets/o/20H_FULL.jpg', 60, '2022-09-29', '20000 Leagues'),
  ('MYE', 'Myst', 'Easy', 'Myst Easy', 'https://objectstorage.us-ashburn-1.oraclecloud.com/n/idw1nygcxpvm/b/wmgt-assets/o/MYE_FULL.jpg', 61, '2022-11-15', 'Myst'),
  ('MYH', 'Myst', 'Hard', 'Myst Hard', 'https://objectstorage.us-ashburn-1.oraclecloud.com/n/idw1nygcxpvm/b/wmgt-assets/o/MYH_FULL.jpg', 63, '2022-11-15', 'Myst'),
  ('ATE', 'Atlantis', 'Easy', 'Atlantis Easy', 'https://objectstorage.us-ashburn-1.oraclecloud.com/n/idw1nygcxpvm/b/wmgt-assets/o/ATE_FULL.jpg', 59, '2023-01-26', 'Atlantis'),
  ('ATH', 'Atlantis', 'Hard', 'Atlantis Hard', 'https://objectstorage.us-ashburn-1.oraclecloud.com/n/idw1nygcxpvm/b/wmgt-assets/o/ATH_FULL.jpg', 59, '2023-01-26', 'Atlantis'),
  ('UTE', 'Upside Town', 'Easy', 'Upside Town Easy', 'https://objectstorage.us-ashburn-1.oraclecloud.com/n/idw1nygcxpvm/b/wmgt-assets/o/UTE_FULL.jpg', 58, '2023-03-09', 'Upside Town'),
  ('UTH', 'Upside Town', 'Hard', 'Upside Town Hard', 'https://objectstorage.us-ashburn-1.oraclecloud.com/n/idw1nygcxpvm/b/wmgt-assets/o/UTH_FULL.jpg', 63, '2023-03-09', 'Upside Town'),
  ('ZZE', 'Temple at Zerzura', 'Easy', 'Temple at Zerzura Easy', 'https://objectstorage.us-ashburn-1.oraclecloud.com/n/idw1nygcxpvm/b/wmgt-assets/o/ZZE_FULL.jpg', 63, '2023-04-20', 'Temple at Zerzura'),
  ('ZZH', 'Temple at Zerzura', 'Hard', 'Temple at Zerzura Hard', 'https://objectstorage.us-ashburn-1.oraclecloud.com/n/idw1nygcxpvm/b/wmgt-assets/o/ZZH_FULL.jpg', 60, '2023-04-20', 'Temple at Zerzura'),
  ('JCE', 'Journey to the Center of the Earth', 'Easy', 'Journey to the Center of the Earth Easy', 'https://objectstorage.us-ashburn-1.oraclecloud.com/n/idw1nygcxpvm/b/wmgt-assets/o/JCE_FULL.jpg', 56, '2023-06-08', 'Journey'),
  ('JCH', 'Journey to the Center of the Earth', 'Hard', 'Journey to the Center of the Earth Hard', 'https://objectstorage.us-ashburn-1.oraclecloud.com/n/idw1nygcxpvm/b/wmgt-assets/o/JCH_FULL.jpg', 60, '2023-06-08', 'Journey'),
  ('LLE', 'Laser Lair', 'Easy', 'Laser Lair Easy', 'https://objectstorage.us-ashburn-1.oraclecloud.com/n/idw1nygcxpvm/b/wmgt-assets/o/LLE_FULL.jpg', 57, '2023-07-20', 'Laser Lair'),
  ('LLH', 'Laser Lair', 'Hard', 'Laser Lair Hard', 'https://objectstorage.us-ashburn-1.oraclecloud.com/n/idw1nygcxpvm/b/wmgt-assets/o/LLH_FULL.jpg', 58, '2023-07-20', 'Laser Lair'),
  ('ALE', 'Alfheim', 'Easy', 'Alfheim Easy', 'https://objectstorage.us-ashburn-1.oraclecloud.com/n/idw1nygcxpvm/b/wmgt-assets/o/ALE_FULL.jpg', 57, '2023-09-07', 'Alfheim'),
  ('ALH', 'Alfheim', 'Hard', 'Alfheim Hard', 'https://objectstorage.us-ashburn-1.oraclecloud.com/n/idw1nygcxpvm/b/wmgt-assets/o/ALH_FULL.jpg', 61, '2023-09-07', 'Alfheim'),
  ('WWE', 'Widow’s Walkabout', 'Easy', 'Widow’s Walkabout Easy', 'https://objectstorage.us-ashburn-1.oraclecloud.com/n/idw1nygcxpvm/b/wmgt-assets/o/WWE_FULL.jpg', 61, '2023-10-19', 'Widows Walkabout'),
  ('WWH', 'Widow’s Walkabout', 'Hard', 'Widow’s Walkabout Hard', 'https://objectstorage.us-ashburn-1.oraclecloud.com/n/idw1nygcxpvm/b/wmgt-assets/o/WWH_FULL.jpg', 60, '2023-10-19', 'Widows Walkabout'),
  ('MWE', 'Meow Wolf', 'Easy', 'Meow Wolf Easy', 'https://objectstorage.us-ashburn-1.oraclecloud.com/n/idw1nygcxpvm/b/wmgt-assets/o/MWE_FULL.jpg', 57, '2023-12-07', 'Meow Wolf'),
  ('MWH', 'Meow Wolf', 'Hard', 'Meow Wolf Hard', 'https://objectstorage.us-ashburn-1.oraclecloud.com/n/idw1nygcxpvm/b/wmgt-assets/o/MWH_FULL.jpg', 57, '2023-12-07', 'Meow Wolf'),
  ('AWE', 'Around The World', 'Easy', 'Around The World Easy', 'https://objectstorage.us-ashburn-1.oraclecloud.com/n/idw1nygcxpvm/b/wmgt-assets/o/AWE_FULL.jpg', 57, '2024-01-18', 'Around The World'),
  ('AWH', 'Around The World', 'Hard', 'Around The World Hard', 'https://objectstorage.us-ashburn-1.oraclecloud.com/n/idw1nygcxpvm/b/wmgt-assets/o/AWH_FULL.jpg', 56, '2024-01-18', 'Around The World'),
  ('ILE', 'Ice Lair', 'Easy', 'Ice Lair Easy', 'https://objectstorage.us-ashburn-1.oraclecloud.com/n/idw1nygcxpvm/b/wmgt-assets/o/ILE_FULL.jpg', 61, '2024-03-07', 'Ice Lair'),
  ('ILH', 'Ice Lair', 'Hard', 'Ice Lair Hard', 'https://objectstorage.us-ashburn-1.oraclecloud.com/n/idw1nygcxpvm/b/wmgt-assets/o/ILH_FULL.jpg', 59, '2024-03-07', 'Ice Lair'),
  ('VNE', 'Venice', 'Easy', 'Venice Easy', 'https://objectstorage.us-ashburn-1.oraclecloud.com/n/idw1nygcxpvm/b/wmgt-assets/o/VNE_FULL.jpg', 58, '2024-04-25', 'Venice'),
  ('VNH', 'Venice', 'Hard', 'Venice Hard', 'https://objectstorage.us-ashburn-1.oraclecloud.com/n/idw1nygcxpvm/b/wmgt-assets/o/VNH_FULL.jpg', 60, '2024-04-25', 'Venice'),
  ('WGE', 'Wallace & Gromit', 'Easy', 'Wallace & Gromit Easy', 'https://objectstorage.us-ashburn-1.oraclecloud.com/n/idw1nygcxpvm/b/wmgt-assets/o/WGE_FULL.jpg', 55, '2024-07-25', 'Wallace & Gromit'),
  ('WGH', 'Wallace & Gromit', 'Hard', 'Wallace & Gromit Hard', 'https://objectstorage.us-ashburn-1.oraclecloud.com/n/idw1nygcxpvm/b/wmgt-assets/o/WGH_FULL.jpg', 55, '2024-07-25', 'Wallace & Gromit'),
  ('MGE', 'Mars Gardens', 'Easy', 'Mars Gardens Easy', 'https://objectstorage.us-ashburn-1.oraclecloud.com/n/idw1nygcxpvm/b/wmgt-assets/o/MGE_FULL.jpg', 58, '2024-09-12', 'Mars Gardens'),
  ('MGH', 'Mars Gardens', 'Hard', 'Mars Gardens Hard', 'https://objectstorage.us-ashburn-1.oraclecloud.com/n/idw1nygcxpvm/b/wmgt-assets/o/MGH_FULL.jpg', 60, '2024-09-12', 'Mars Gardens'),
  ('8BE', '8-Bit Lair', 'Easy', '8-Bit Lair Easy', 'https://objectstorage.us-ashburn-1.oraclecloud.com/n/idw1nygcxpvm/b/wmgt-assets/o/8BE_FULL.jpg', 57, '2024-10-24', '8 BIT Lair'),
  ('8BH', '8-Bit Lair', 'Hard', '8-Bit Lair Hard', 'https://objectstorage.us-ashburn-1.oraclecloud.com/n/idw1nygcxpvm/b/wmgt-assets/o/8BH_FULL.jpg', 61, '2024-10-24', '8 BIT Lair'),
  ('HHE', 'Holiday Hideaway', 'Easy', 'Holiday Hideaway Easy', 'https://objectstorage.us-ashburn-1.oraclecloud.com/n/idw1nygcxpvm/b/wmgt-assets/o/HHE_FULL.jpg', 56, '2024-12-05', 'Holiday Hideaway'),
  ('HHH', 'Holiday Hideaway', 'Hard', 'Holiday Hideaway Hard', 'https://objectstorage.us-ashburn-1.oraclecloud.com/n/idw1nygcxpvm/b/wmgt-assets/o/HHH_FULL.jpg', 55, '2024-12-05', 'Holiday Hideaway'),
  ('ELE', 'Viva Las Elvis', 'Easy', 'Viva Las Elvis Easy', 'https://objectstorage.us-ashburn-1.oraclecloud.com/n/idw1nygcxpvm/b/wmgt-assets/o/ELE_FULL.jpg', 57, '2025-01-16', 'Viva Las Elvis'),
  ('ELH', 'Viva Las Elvis', 'Hard', 'Viva Las Elvis Hard', 'https://objectstorage.us-ashburn-1.oraclecloud.com/n/idw1nygcxpvm/b/wmgt-assets/o/ELH_FULL.jpg', 60, '2025-01-16', 'Viva Las Elvis'),
  ('MOE', 'Mount Olympus', 'Easy', 'Mount Olympus Easy', 'https://objectstorage.us-ashburn-1.oraclecloud.com/n/idw1nygcxpvm/b/wmgt-assets/o/MOE_FULL.jpg', 61, '2025-03-06', 'Olympus Easy'),
  ('MOH', 'Mount Olympus', 'Hard', 'Mount Olympus Hard', 'https://objectstorage.us-ashburn-1.oraclecloud.com/n/idw1nygcxpvm/b/wmgt-assets/o/MOH_FULL.jpg', 62, '2025-03-06', 'Olympus Hard'),
  ('RCE', 'Raptor Cliff''s', 'Easy', 'Raptor Cliff''s Easy', 'https://objectstorage.us-ashburn-1.oraclecloud.com/n/idw1nygcxpvm/b/wmgt-assets/o/RCE_FULL.jpg', 59, '2025-05-01', 'Raptor Cliffs'),
  ('RCH', 'Raptor Cliff''s', 'Hard', 'Raptor Cliff''s Hard', 'https://objectstorage.us-ashburn-1.oraclecloud.com/n/idw1nygcxpvm/b/wmgt-assets/o/RCH_FULL.jpg', 59, '2025-05-01', 'Raptor Cliffs'),
  ('CLE', 'Crystal Lair', 'Easy', 'Crystal Lair Easy', 'https://objectstorage.us-ashburn-1.oraclecloud.com/n/idw1nygcxpvm/b/wmgt-assets/o/CLE_FULL.jpg', 58, '2025-06-26', 'Crystal Lair'),
  ('CLH', 'Crystal Lair', 'Hard', 'Crystal Lair Hard', 'https://objectstorage.us-ashburn-1.oraclecloud.com/n/idw1nygcxpvm/b/wmgt-assets/o/CLH_FULL.jpg', 58, '2025-06-26', 'Crystal Lair'),
  ('TOE', 'Tokyo', 'Easy', 'Tokyo Easy', 'https://objectstorage.us-ashburn-1.oraclecloud.com/n/idw1nygcxpvm/b/wmgt-assets/o/TOE_FULL.jpg', 55, '2025-08-14', 'Tokyo'),
  ('TOH', 'Tokyo', 'Hard', 'Tokyo Hard', 'https://objectstorage.us-ashburn-1.oraclecloud.com/n/idw1nygcxpvm/b/wmgt-assets/o/TOH_FULL.jpg', 55, '2025-08-14', 'Tokyo'),
  ('FFE', 'Forgotten Fairyland', 'Easy', 'Forgotten Fairyland Easy', 'https://objectstorage.us-ashburn-1.oraclecloud.com/n/idw1nygcxpvm/b/wmgt-assets/o/FFE_FULL.jpg', 64, '2025-10-09', 'Forgotten Fairyland'),
  ('FFH', 'Forgotten Fairyland', 'Hard', 'Forgotten Fairyland Hard', 'https://objectstorage.us-ashburn-1.oraclecloud.com/n/idw1nygcxpvm/b/wmgt-assets/o/FFH_FULL.jpg', 59, '2025-10-09', 'Forgotten Fairyland'),
  ('WOE', 'Alice''s Adventures in Wonderland', 'Easy', 'Alice''s Adventures in Wonderland Easy', 'https://objectstorage.us-ashburn-1.oraclecloud.com/n/idw1nygcxpvm/b/wmgt-assets/o/WOE_FULL.jpg', 64, '2025-12-04', 'Alice In Wonderland'),
  ('WOH', 'Alice''s Adventures in Wonderland', 'Hard', 'Alice''s Adventures in Wonderland Hard', 'https://objectstorage.us-ashburn-1.oraclecloud.com/n/idw1nygcxpvm/b/wmgt-assets/o/WOH_FULL.jpg', 66, '2025-12-04', 'Alice In Wonderland'),
  ('TCE', 'Tiki à Coco', 'Easy', 'Tiki à Coco Easy', 'https://objectstorage.us-ashburn-1.oraclecloud.com/n/idw1nygcxpvm/b/wmgt-assets/o/TCE_FULL.jpg', 55, '2026-01-15', 'Tiki a Coco'),
  ('TCH', 'Tiki à Coco', 'Hard', 'Tiki à Coco Hard', 'https://objectstorage.us-ashburn-1.oraclecloud.com/n/idw1nygcxpvm/b/wmgt-assets/o/TCH_FULL.jpg', 57, '2026-01-15', 'Tiki a Coco'),
  ('HWE', 'Hollywood', 'Easy', 'Hollywood Easy', 'https://objectstorage.us-ashburn-1.oraclecloud.com/n/idw1nygcxpvm/b/wmgt-assets/o/HWE_FULL.jpg', 56, '2026-03-12', 'Hollywood'),
  ('HWH', 'Hollywood', 'Hard', 'Hollywood Hard', 'https://objectstorage.us-ashburn-1.oraclecloud.com/n/idw1nygcxpvm/b/wmgt-assets/o/HWH_FULL.jpg', 62, '2026-03-12', 'Hollywood'),
  ('BHE', 'Blokhaven', 'Easy', 'Blokhaven Easy', 'https://objectstorage.us-ashburn-1.oraclecloud.com/n/idw1nygcxpvm/b/wmgt-assets/o/BHE_FULL.jpg', 53, '2026-05-07', null),
  ('BHH', 'Blokhaven', 'Hard', 'Blokhaven Hard', 'https://objectstorage.us-ashburn-1.oraclecloud.com/n/idw1nygcxpvm/b/wmgt-assets/o/BHH_FULL.jpg', 59, '2026-05-07', null),
  ('GLE', 'Gloop Lair', 'Easy', 'Gloop Lair Easy', 'https://objectstorage.us-ashburn-1.oraclecloud.com/n/idw1nygcxpvm/b/wmgt-assets/o/GLE_FULL.jpg', 63, '2026-08-13', null),
  ('GLH', 'Gloop Lair', 'Hard', 'Gloop Lair Hard', 'https://objectstorage.us-ashburn-1.oraclecloud.com/n/idw1nygcxpvm/b/wmgt-assets/o/GLH_FULL.jpg', 63, '2026-08-13', null)
  ) as staged(code, base_map, difficulty, display_name, image_url, par, release_date, source_course_name);

  if jsonb_array_length(v_catalog) <> 82
     or (select count(distinct item->>'code') from jsonb_array_elements(v_catalog) item) <> 82 then
    raise exception 'The official All-Time catalog must contain exactly 82 unique codes';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(v_catalog) as staged(base_map text, difficulty text)
    group by staged.base_map, staged.difficulty
    having count(*) > 1
  ) then
    raise exception 'The official All-Time catalog contains a duplicate individual course';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(v_catalog) as staged(code text, base_map text, difficulty text, display_name text)
    join public.all_time_courses existing on existing.code = staged.code
    where (existing.base_map, existing.difficulty, existing.display_name)
      is distinct from (staged.base_map, staged.difficulty, staged.display_name)
  ) then
    raise exception 'An installed All-Time code conflicts with the official catalog';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(v_catalog) as staged(code text, base_map text, difficulty text)
    join public.all_time_courses existing
      on existing.base_map = staged.base_map and existing.difficulty = staged.difficulty
    where existing.code <> staged.code
  ) then
    raise exception 'An individual All-Time course is already assigned to another code';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(v_catalog) as staged(code text, difficulty text, source_course_name text)
    join public.all_time_course_source_mappings mapping
      on mapping.source_type = 'historical_workbook'
     and mapping.source_course_name = staged.source_course_name
     and mapping.difficulty = staged.difficulty
    join public.all_time_courses existing on existing.id = mapping.course_id
    where staged.source_course_name is not null and existing.code <> staged.code
  ) then
    raise exception 'An installed historical-workbook mapping conflicts with the official catalog';
  end if;
  insert into public.all_time_courses
    (code, base_map, difficulty, display_name, image_url, par, release_date, active)
  select staged.code, staged.base_map, staged.difficulty, staged.display_name,
    staged.image_url, staged.par, staged.release_date, true
  from jsonb_to_recordset(v_catalog) as staged(
    code text,
    base_map text,
    difficulty text,
    display_name text,
    image_url text,
    par integer,
    release_date date
  )
  on conflict (code) do nothing;

  insert into public.all_time_course_source_mappings
    (source_type, source_course_name, difficulty, course_id)
  select 'historical_workbook', staged.source_course_name, staged.difficulty, course.id
  from jsonb_to_recordset(v_catalog) as staged(
    code text,
    difficulty text,
    source_course_name text
  )
  join public.all_time_courses course on course.code = staged.code
  where staged.source_course_name is not null
  on conflict (source_type, source_course_name, difficulty) do nothing;
end;
$migration$;
