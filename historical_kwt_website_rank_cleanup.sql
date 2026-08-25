begin;

-- The installed Historical KWT schema stores the website's rank/division band
-- in historical_rank and raw_historical_rank. This one-time marker prevents a
-- later rerun from discovering and changing any future imports.
-- The SHA set below is the exact 124-source set in
-- docs/historical-sources/kwt/website-score-recovery/raw-response-manifest.json.
create table if not exists public.historical_kwt_website_rank_cleanup_runs (
  id boolean primary key default true check (id),
  matched_import_count integer not null,
  cleared_scorecard_count integer not null,
  completed_at timestamptz not null default now()
);

alter table public.historical_kwt_website_rank_cleanup_runs enable row level security;
revoke all on public.historical_kwt_website_rank_cleanup_runs from public, anon, authenticated;

do $historical_kwt_website_rank_cleanup$
declare
  v_import_count integer := 0;
  v_scorecard_count integer := 0;
  v_website_source_shas text[] := array[
    '5ddebf51a5464f241d49d6eaabdd44a5cc02ad3bf79c7258a6ba8a1ff0c48322',
    '27b0b90af9fc69d712cae907f24cf0c28451e1801dbf1ed59df9ccffea3742c3',
    '91647a8689f4618572b86e0080d540117bfdd27c1e2bc04cc1880a32946f43fd',
    '74b3c0fda44bed110c7e3f8f704c05abe5cf8523e307ac1113e5fd944fe8b069',
    '48f30a2fe8f3f295574c5ba3955f0a70aa68ae7851641e743f0194c61f51d775',
    '8e7d806025d9466700c632f24ad5def62702ab3a39ba37c47cd3a3c5eb402936',
    '386787c56f9ce89fe3ed7d869b4a0d586abf0702952e8bedac4f35367a2b060f',
    '506b99ca5290ca6ff3da1b4f0310b7ccb41a3b09e1e3e7ce6c90e2c22e0ad708',
    'ce8be75d098c4515ee3e5d7a6f14ffbd2068fb6c7ebb276cb3eec120b7413eb8',
    'd30f85b029157f74a2d4d46358725b86915aa6bbca1f150d2b3ebe584835c73b',
    '3906f1e2aecff0ef0ff0a439752d959321aeaa03ab666753368a6c5cf573a337',
    '44dcfe67cf19ef2d3edf21c634becd4d39880bd6741a2006c7dce882e7091d6e',
    '6007ddc339b8073da9a2414354da3cca9001a36f3330d94fc1d86d1de35d43c1',
    '0c0c4e1b5e8517e0f595874ce31799b4b8ef5effcafe85c3a92da7214ad4f32a',
    'bd1fc643f0897868bf708f49bff2c782eb5e4d86862ef69f35f8e1f1562eb58b',
    '692fc40b0eb699f1c3e231e38c95fdbeb1de964680c4a93296b9e3ca1a0a8fb0',
    'd390713458c286fc5844dfb80490ccadb574df3d6ec07f8c8f38d83546103304',
    '6720ba2234af079fe7e4178baf1d3033febb76db01ce505d09ea42b10ac4f510',
    'e623d90eee689a7a4cdaa522b806332af03bbd0ae6d097daa909b3ba3b17a7b9',
    'a0389c2450eb8b4dce514c617ef9c9199d580e23674be04a058d66f095ebf2ca',
    '8a6a1dcdce63b4c5ef3f482ef56c1277e4a044192da4af79617026b3b2cb4650',
    'abc7ac42f0c6ed76650f2cecce39bd193e9497f98e2210ea25c4c04b8e211dbf',
    '535cdce27b3345ed165a2d0807decab51da0f2ca6c8f24e429287fa38d2d9daf',
    '01c81f79182d5e450645881e11670e8a7711b007d4ea3e8068ef1943e0ab07f1',
    '7a4ddbca5e3f5df0172f1a9b3938d2ca59d37de283e296f609acf66a0a6ed7a0',
    'a595acdfeb7eb198e4240fd5f1612e363136ed8c50667b6e364fd27b0dfff9fe',
    'a5fe2717bb0121a3f9d5ba21a03f1fcbd884b33a5fec5ec3da8605689fec4f11',
    '94bac42a7d24538cdfc79863c565a5d028d52c310fe62f11514624faf055d1f1',
    '06fd122f6bba5198c05f00927cd7ceebba64c248f2db6d34b9429de885e631d4',
    'd0acb953494e664f1017caa5f54013b69851d1efe485507a1de34d0669572493',
    '5b5cd36c67ede3d4fa47dadbfcb197a867fda770d66ad1738bf3e88094dfb8f3',
    'dc5b9605deb9499d55df992a998870de8c2258e7b5c34109b993c2830dbe54fa',
    '40d64822d8b153c96b007837b7044ae7670241c6ecf7871c8348f8966962d56b',
    'f2a35c5b424c503ca5793351a0d666a2f64df3b611afc93d04af0ace23567e23',
    '8712c97c9af168e634f2b008788b65ff088ff322dd58c9e65a12b17f3f8823cc',
    'eac36f0a5785b7f9b448245f54c41c03861e9b9651b09ba201d2d85809b815a6',
    '00ea63b987233d1719ace2042cd6b6cf9293fc6924c0220c7562ade740f41c6c',
    '4cce22e0fc7f548aa1e3f21a19414ac93fe8033645b3073f6a3520dd150f26df',
    '622356544336a987cb9a6f9b09cea5265016e4c2809039a685e952e764dfe1a6',
    '4cc264bd219c411dccb1737792be4fd3cb19ae8136d3e4f1689a3150228c0d26',
    '87de70d57b200878ec3f84100ddbd0316bb17fb804a8982b9e7e8712ba2600c0',
    '196a8c8e58d6360d12b3d38672f9143a2958856edb4ac9a39c77214b00ed6f97',
    'ba4a3f7ccb2181e95383b9fc9b06a3c580b366858def1a80434794d31c18d4f6',
    '8cb6bcecc1fe5e95fce3450fd695ff1dd4f110b7c769b5774845ee54492e8df3',
    '3eadd04e68f5edcf3cb9b495960789a53ff86b040c6c5f8df334b7f8a4686065',
    '072fd031ec3887c3e288dcb98cc99b7f3562d1985d4c4d748176dd2976ce5654',
    '0ab9b9980c79839f1e0e79432fb9d852b4767284d3955cd725b9f241857b539e',
    'e9b09c6366b709d2c6c36667f2a6c00eafae6fe41c94d586b00a85375d718fd9',
    '3bd206708e32dbdfda1899157fadebc9504c6c81ed93f4d14b01747cfe15cdf5',
    '58ecdaf958234524c2718272f3ed9aa9e9c679ccdd2b1e899fe23b7fe21650ec',
    '1894b1c111218b1234e59adae182f16cbc86bf5d78c804cd7be872fbc0d6c3fd',
    '675804db8589a980d4c6bc866cca39c5c5f5e9cee960f2fb8745800a514136a0',
    'dd2e1900212dd539c147bdd854e32bdf8361885e87772d8e2d6cad9ced2b6f6a',
    'd15701cd9320640d74939b00e6e3a4a7f1bab33ba9f4690526029c69501fc0cc',
    '423a2b044524f885db0463d1f0fd9575f8b37b6f307011672db9e9417e5f686d',
    'b660925a2922e4480aeb61e1e40393bb686d10cc61d38264d995d4cbd7aadb3c',
    '0f3462de0abe35823ac409f70af0307bbbca1dac090333fb320bafe6ed83bc3d',
    '436207bd9265ae0edb19cfb0e69c3b48dcf2ad937c3e54eefe63c975220c00ef',
    '6fa2128790acd952de37426d811b21ab6228791a7ff7b567ba7d028dc7185013',
    '0c7dce06f54f160bf1522162c71d64e2d9429b7f4e0683bb5a1c66912552f51b',
    'd8260ff3efe2fe71ddad16e475ec3ad4f389e8f2236e9f7a5cf43aca25061fd2',
    '49c442ea6445b461b809f480a37b7de09da9f83953305ae883547d5c01827441',
    '34542aa09145b220d45e02fd7c0e69b4fa5957df4ca9fc7a5cb2f873ccd7f9c1',
    '0a8f17276e00c69965b385141dc112ae558d3a4ba60e7d35dd022ca1471c4f60',
    '4f27ea9ecd03689f9e83765da535bf9ff42df01c09638f75932aff81646427f6',
    '5a4e9e6bad62f7f8ae738eee80f041a71307d51d13df4c9d0326cadb2b6e364c',
    'd3ab948f6b0d7644fcc2389816d3318c31222cd8234a3add08230fa3e51e5993',
    'd025bab0aae54f8ea4bd0b55e724d19b0050a81bc0b50e70c7070899d78134e0',
    '11fc1cea8fa542d131619c8b182b3da24e1d722c0dd680afdce70e9c65a52cd9',
    'ec2c9ec4f22714e277e738a8a94d6949fedb52d0ad5b598a734a6dd657d7cf89',
    'bd74a4d0c348ae319aef1700b6db9f88644e6e775e84b73b6547f21b4b55f42f',
    '60e26615a33f31709732e97f8f0c6e0663ff5354ff25d493de3877e588afbb95',
    'afa78628e4466d162e3ddf90b0c9ee74b0309109b7c6707afe077b595a7bb1ac',
    '4954cb6f564b6f6acbe5d00e779c4c98f6c5e1295043d80d8a4826621f6115c1',
    'cbd039d7a30679fb5b0cc46b1ccab3789de8ccda70f088576c68e0f751ba6dbd',
    'd174462b10c0bae5cd20756be1e50d5c3e04987854794911f4cc8ed621f3b43c',
    '52f513f3b075949c24bdc57200d4ddc014bb5e7c4744f12de600c0f98996decf',
    '04ad02049a1dd32c78d25c6cacd94cbf849377f2a2e6af9fc576f97362b5120d',
    'b65021e250cf821f72eb7b6661ee4e15d13c7719acb9374d5c4ebe1469ff6d53',
    '6ea6601e1f6b9bee2f69c2a4362a4f51096a00bdc6ddbd27a57a5da87be80954',
    'f8205a80b12f95b4270822967d0483b49e8e45bd18555465a30be3e15d1ef490',
    '48709dc117b4b3aa7af0ef9506fbf5b2ec658992d15b1a25ebd1855c847d9fb7',
    'd486210fc11bc56db2e31ba3e234a671e002d65ea75ee111a6114ea3cd378ab3',
    '7e25d78a5cd4fe61c243ede6a7261f0bda9da239d27cdccbe8a1128a7f9432f7',
    'ea19ab9aa6108820fcd74061fd34b1dafd44fdd663a282f74bce31dc8a1caeee',
    '0399dabdd0093fd0e61a4e96360fd9ca75fd5801770ee3f663350c634aea8499',
    '9019a24b2b5be55cfc923a50affc0e6287a4fe17d119b6775980a2b74bc32c69',
    'e573586e69c91a7acbcac5a49b58585fb5e79f793e4d20a96f36a4a0a1bc7363',
    '9877407cbda16bfc8cf9a6c85ed831077ea9bf3e553abadfe8a7179d5ff3dd7e',
    '2eb7031eba599a1ec2d81b9bde56cddd945522078722f2ccf7f3235e34c2b60b',
    '972dd0a9f024624261014bdafb11a7aa5958ff499918d900d657320465946f47',
    '8523b97dd9d21314cb6c2120016ad6617a5ec0cbdc192bf40552f09153adc969',
    '497f77ab94e0f2c91a765d043fcdc4d2b0eff0a7e6b864a30a2cbb06cf074283',
    '1db07ad723e918f7ba43af14a12a5b887fb442022ec4c0104b4bff2269ba23db',
    '86e85db2afd388b3713c72257b73a2f8c8a690a4ed322edf863fa99827bf8dc9',
    '937a148c7fd7cbccc2cb3126f7691274c336e75f7bc02147dd2668d3dbd537f9',
    '00c664843d0b4d3714ae9cfaac26547dedf19b6011f47ddca20a95faf8ac34bf',
    'cf0447e59b4ac5bc7df58eeac268de1ca43fe44470ad26a47b7915ba37e8ce71',
    '18da13a29e7e051a728511ce9a538c36abb93e6f2ae3ed6f48eb132073f710f1',
    '859951b7f17259df8df79783b0fbfdb851c71f32bec54576d93c81f1e2445369',
    '5e7285adb4025bafe41993391e17783e4eec5b09b59854bc0ab75e3675a9534d',
    'b3b895ec2eb28ff90c22492054fb54126fad57ea3e4d81adfb7d69d275feabde',
    '25f1b76a865bce1821b64c770e9afaa33842974c16dfc4661306f71666261acd',
    '94936b0371e9f2730f38fde8c2da0d64aa093e5f38c0f58ee41081680db6f82f',
    '3d1b3d5098aecd2b0eb414640a4a39cab2cb5f701279ab3238c493c584ec26ab',
    'c082c7c791c494af3f03fa5a8069844675bb1cd8b361da1025116ce0f2e937cf',
    'f561e0fefecc63b2b59a200a1840de56ada848572199a3cd267a3248803d1c64',
    '5fb80748c6e1c15192f1161e3f264e4fd36e1051d2a4f5cc2a65f4207b1c1bba',
    'ba526118172ec717ce2a4805e350b864b84499dbfb3d3c78677d197432fddf31',
    '2d825e6216615f3f7d50443e2994a571239e882ab3f8b399638c56b0f8baffbc',
    'fe8c419ea35ded207a0a8c4f3fb439b7587ddbf73c780815a8d178dc06ef4cbf',
    '1059cc67b75bc4b673423e9ac6fae91d2c4697b7bdc88aec4d20344363b6c7e5',
    '6dc5b44840d3a87d1591ecaa0ebcd3cef4e2e66872071f6daf3083374b471fdb',
    '4390afc458efb36d3637fc00a64db8469e5bad8ee144992eaba884162f814f24',
    '20f673ce765fff310f836e5d180d67e7814a113146a4ef95c53909a186b3307f',
    '6c5645a0c76387a01a124c36486afc58e3c24fa5780b9bdb075d7a205b7104b1',
    'ba9c2a28774cd90a69a21d4bc6ecfe7ec4e708e5cc90f76a5858edb7c35a2b9a',
    'aaded352f926140c6e66c18c60980927891495cf4ca171b345301a3a3f72431c',
    'c3c1b2ebfd2a17d50ff35d74fff377d404a5ba9154719e2928c89e87d7eb24f6',
    'f434924add779133acf5dd77b765d28340e74a455cf4581f61dc250e8a558230',
    '1d48e597ce1a69581d6f9985b46ec8f1eca4625d63355b230962454a867d65ad',
    '728013bde581a7805ebca97d235bbc554805cb3e03552ce87739a8e12f551a76',
    'ff52e1155c4a1a39e5b57f2365b6e3e8aaafb0e1c4d2bba33ff305a8d12507c2',
    'b98b656b9a3db82028f8412be5259438a9bc4d1f289b99d639991466a5465e92'
  ];
begin
  if to_regclass('public.historical_kwt_imports') is null
     or to_regclass('public.historical_kwt_scorecards') is null then
    raise exception 'Historical KWT tables are missing; install the foundation first';
  end if;

  if exists (
    select 1
    from public.historical_kwt_website_rank_cleanup_runs
    where id = true
  ) then
    raise notice 'Historical KWT website rank cleanup already completed; no rows changed';
    return;
  end if;

  select count(*)::integer
    into v_import_count
  from public.historical_kwt_imports as source_import
  where source_import.source_sha256 = any(v_website_source_shas);

  update public.historical_kwt_scorecards as score
  set historical_rank = null,
      raw_historical_rank = null
  where score.historical_kwt_import_id in (
    select source_import.id
    from public.historical_kwt_imports as source_import
    where source_import.source_sha256 = any(v_website_source_shas)
  )
    and (score.historical_rank is not null or score.raw_historical_rank is not null);
  get diagnostics v_scorecard_count = row_count;

  insert into public.historical_kwt_website_rank_cleanup_runs (id, matched_import_count, cleared_scorecard_count)
  values (true, v_import_count, v_scorecard_count);

  raise notice 'Historical KWT website rank cleanup completed: % import(s), % scorecard row(s) cleared', v_import_count, v_scorecard_count;
end;
$historical_kwt_website_rank_cleanup$;

commit;
