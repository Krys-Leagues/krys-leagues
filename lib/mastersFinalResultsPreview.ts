// Staging-only snapshot of verified Masters scorecard facts. Placements are
// source-owned: only the approved Top 10 is populated until the complete
// official leaderboard source is supplied.
export type MastersPreviewRound = { strokes: number; toPar: number } | null

export type MastersPreviewPlayer = {
  playerId: string
  screenName: string
  rounds: readonly MastersPreviewRound[]
  officialPlacement: number | null
  isTied: boolean
}

export const MASTERS_PREVIEW_APPROVED_TOP_TEN = [
  { screenName: "DUARDY", placement: 1 },
  { screenName: "ZANETTI", placement: 2 },
  { screenName: "TRICKYDICKY", placement: 3 },
  { screenName: "leanin2it", placement: 4 },
  { screenName: "GOMARINO13", placement: 5 },
  { screenName: "GOLDENBRETT", placement: 6 },
  { screenName: "DUCKK", placement: 7 },
  { screenName: "JESUNET", placement: 8 },
  { screenName: "BIGJA", placement: 9 },
  { screenName: "ZONK", placement: 9 },
] as const

export const MASTERS_PREVIEW_NEVER_PLAYED = [
  { playerId: "c60ed0d8-1f05-4675-b635-342707607c18", screenName: "ALYSSA38" },
  { playerId: "c9e93aeb-f148-4ae0-a68a-5061436d47cf", screenName: "FAKKU FR" },
  { playerId: "6918df0a-cc2b-495a-8c09-b8be600ed0bc", screenName: "MAXFROM-FR" },
] as const

export const MASTERS_PREVIEW_PLAYERS: readonly MastersPreviewPlayer[] = [
  {
    "playerId": "b9150f7d-f024-4f56-9af8-a66fe99cf7a8",
    "screenName": "5.0JIM",
    "rounds": [
      {
        "toPar": -23,
        "strokes": 40
      },
      {
        "toPar": -29,
        "strokes": 34
      },
      {
        "toPar": -12,
        "strokes": 55
      },
      {
        "toPar": -26,
        "strokes": 41
      }
    ],
    "officialPlacement": null,
    "isTied": false
  },
  {
    "playerId": "9976197b-dc3d-4cf6-9200-603a3d1acbf9",
    "screenName": "BadWolff�",
    "rounds": [
      {
        "toPar": -19,
        "strokes": 44
      },
      {
        "toPar": -25,
        "strokes": 38
      },
      {
        "toPar": -18,
        "strokes": 49
      },
      {
        "toPar": -19,
        "strokes": 48
      }
    ],
    "officialPlacement": null,
    "isTied": false
  },
  {
    "playerId": "69c0daa5-70b8-481b-94e5-a9d033bc75fb",
    "screenName": "BIGJA",
    "rounds": [
      {
        "toPar": -27,
        "strokes": 36
      },
      {
        "toPar": -28,
        "strokes": 35
      },
      {
        "toPar": -20,
        "strokes": 47
      },
      {
        "toPar": -18,
        "strokes": 49
      }
    ],
    "officialPlacement": 9,
    "isTied": true
  },
  {
    "playerId": "9ba01526-5c8d-4118-81a0-1934c8daee37",
    "screenName": "BLUTES87",
    "rounds": [
      {
        "toPar": -29,
        "strokes": 34
      },
      {
        "toPar": -25,
        "strokes": 38
      },
      {
        "toPar": -19,
        "strokes": 48
      },
      {
        "toPar": -14,
        "strokes": 53
      }
    ],
    "officialPlacement": null,
    "isTied": false
  },
  {
    "playerId": "62b923df-f790-4ea3-936d-80af6508ce2a",
    "screenName": "Calassy",
    "rounds": [
      {
        "toPar": -25,
        "strokes": 38
      },
      {
        "toPar": -26,
        "strokes": 37
      },
      {
        "toPar": -21,
        "strokes": 46
      },
      {
        "toPar": -20,
        "strokes": 47
      }
    ],
    "officialPlacement": null,
    "isTied": false
  },
  {
    "playerId": "100a9131-fd1e-49cd-b194-2c1c2f07387f",
    "screenName": "Captain",
    "rounds": [
      null,
      {
        "toPar": -19,
        "strokes": 44
      },
      {
        "toPar": -18,
        "strokes": 49
      },
      {
        "toPar": -11,
        "strokes": 56
      }
    ],
    "officialPlacement": null,
    "isTied": false
  },
  {
    "playerId": "fd74c52c-dd6e-4f64-8a55-81294a886360",
    "screenName": "CATHYG",
    "rounds": [
      {
        "toPar": -22,
        "strokes": 41
      },
      {
        "toPar": -22,
        "strokes": 41
      },
      {
        "toPar": -11,
        "strokes": 56
      },
      {
        "toPar": -10,
        "strokes": 57
      }
    ],
    "officialPlacement": null,
    "isTied": false
  },
  {
    "playerId": "66629910-223c-43f7-b563-bcab2da902a2",
    "screenName": "CatWeazel",
    "rounds": [
      {
        "toPar": -22,
        "strokes": 41
      },
      {
        "toPar": -22,
        "strokes": 41
      },
      {
        "toPar": -17,
        "strokes": 50
      },
      {
        "toPar": -9,
        "strokes": 58
      }
    ],
    "officialPlacement": null,
    "isTied": false
  },
  {
    "playerId": "d38c0220-8a80-45a6-86e8-d495f523d5ab",
    "screenName": "CHIPNPUTT",
    "rounds": [
      {
        "toPar": -26,
        "strokes": 37
      },
      {
        "toPar": -24,
        "strokes": 39
      },
      {
        "toPar": -18,
        "strokes": 49
      },
      {
        "toPar": -17,
        "strokes": 50
      }
    ],
    "officialPlacement": null,
    "isTied": false
  },
  {
    "playerId": "bed410dd-2b89-4db3-8fe4-8226c21c3f5f",
    "screenName": "Dandnt65",
    "rounds": [
      {
        "toPar": -18,
        "strokes": 45
      },
      {
        "toPar": -18,
        "strokes": 45
      },
      {
        "toPar": -12,
        "strokes": 55
      },
      {
        "toPar": -13,
        "strokes": 54
      }
    ],
    "officialPlacement": null,
    "isTied": false
  },
  {
    "playerId": "95b55b59-45bc-4eaa-a3fe-8c89ab150488",
    "screenName": "DawnSophia (Spicy)",
    "rounds": [
      {
        "toPar": -22,
        "strokes": 41
      },
      {
        "toPar": -22,
        "strokes": 41
      },
      {
        "toPar": -20,
        "strokes": 47
      },
      {
        "toPar": -21,
        "strokes": 46
      }
    ],
    "officialPlacement": null,
    "isTied": false
  },
  {
    "playerId": "b77d2644-31eb-4b82-9f76-f124a25b9a06",
    "screenName": "deebee",
    "rounds": [
      {
        "toPar": -22,
        "strokes": 41
      },
      {
        "toPar": -23,
        "strokes": 40
      },
      {
        "toPar": -16,
        "strokes": 51
      },
      {
        "toPar": -20,
        "strokes": 47
      }
    ],
    "officialPlacement": null,
    "isTied": false
  },
  {
    "playerId": "72432212-9450-4b8a-8819-ad01c86555da",
    "screenName": "DERBY_DAZ",
    "rounds": [
      {
        "toPar": -24,
        "strokes": 39
      },
      {
        "toPar": -26,
        "strokes": 37
      },
      {
        "toPar": -21,
        "strokes": 46
      },
      {
        "toPar": -14,
        "strokes": 53
      }
    ],
    "officialPlacement": null,
    "isTied": false
  },
  {
    "playerId": "04906c17-051a-4a5a-94da-f5d497d21a8b",
    "screenName": "DICK24-7",
    "rounds": [
      {
        "toPar": -22,
        "strokes": 41
      },
      {
        "toPar": -18,
        "strokes": 45
      },
      {
        "toPar": -7,
        "strokes": 60
      },
      {
        "toPar": -12,
        "strokes": 55
      }
    ],
    "officialPlacement": null,
    "isTied": false
  },
  {
    "playerId": "2640996d-5e34-490d-bc9d-a202d1bf4d98",
    "screenName": "DUARDY",
    "rounds": [
      {
        "toPar": -27,
        "strokes": 36
      },
      {
        "toPar": -32,
        "strokes": 31
      },
      {
        "toPar": -23,
        "strokes": 44
      },
      {
        "toPar": -26,
        "strokes": 41
      }
    ],
    "officialPlacement": 1,
    "isTied": false
  },
  {
    "playerId": "dbc70bf7-5239-440c-aad1-b2b288311a7d",
    "screenName": "DUCKK",
    "rounds": [
      {
        "toPar": -26,
        "strokes": 37
      },
      {
        "toPar": -29,
        "strokes": 34
      },
      {
        "toPar": -23,
        "strokes": 44
      },
      {
        "toPar": -17,
        "strokes": 50
      }
    ],
    "officialPlacement": 7,
    "isTied": false
  },
  {
    "playerId": "78b95430-f473-41a2-b770-5bb5c36545e4",
    "screenName": "EARTHLING",
    "rounds": [
      {
        "toPar": -20,
        "strokes": 43
      },
      {
        "toPar": -23,
        "strokes": 40
      },
      {
        "toPar": -6,
        "strokes": 61
      },
      null
    ],
    "officialPlacement": null,
    "isTied": false
  },
  {
    "playerId": "8832eacf-2433-4ea3-b97e-5d0d25da3099",
    "screenName": "EL JORGE",
    "rounds": [
      {
        "toPar": -25,
        "strokes": 38
      },
      {
        "toPar": -27,
        "strokes": 36
      },
      {
        "toPar": -13,
        "strokes": 54
      },
      {
        "toPar": -21,
        "strokes": 46
      }
    ],
    "officialPlacement": null,
    "isTied": false
  },
  {
    "playerId": "9bd2dae6-70e9-444b-a718-ea8f8637e45f",
    "screenName": "elvis_the_pelvis.#0",
    "rounds": [
      {
        "toPar": -23,
        "strokes": 40
      },
      {
        "toPar": -23,
        "strokes": 40
      },
      {
        "toPar": -11,
        "strokes": 56
      },
      {
        "toPar": -9,
        "strokes": 58
      }
    ],
    "officialPlacement": null,
    "isTied": false
  },
  {
    "playerId": "cfcd0387-84ad-417b-92fc-b4653574e66d",
    "screenName": "FAR CANAL",
    "rounds": [
      {
        "toPar": -24,
        "strokes": 39
      },
      {
        "toPar": -21,
        "strokes": 42
      },
      {
        "toPar": -18,
        "strokes": 49
      },
      {
        "toPar": -21,
        "strokes": 46
      }
    ],
    "officialPlacement": null,
    "isTied": false
  },
  {
    "playerId": "5b6c5d4f-b68e-4223-b415-7149bf39a789",
    "screenName": "FUGOHALLARIN",
    "rounds": [
      {
        "toPar": -23,
        "strokes": 40
      },
      {
        "toPar": -24,
        "strokes": 39
      },
      null,
      null
    ],
    "officialPlacement": null,
    "isTied": false
  },
  {
    "playerId": "5b961f90-36b7-4b98-9983-5dd69a933e2d",
    "screenName": "GATORSFAN89",
    "rounds": [
      {
        "toPar": -26,
        "strokes": 37
      },
      null,
      null,
      null
    ],
    "officialPlacement": null,
    "isTied": false
  },
  {
    "playerId": "9c61e55a-0161-47ce-b577-a10c3d35dc83",
    "screenName": "GOLDENBRETT",
    "rounds": [
      {
        "toPar": -24,
        "strokes": 39
      },
      {
        "toPar": -30,
        "strokes": 33
      },
      {
        "toPar": -20,
        "strokes": 47
      },
      {
        "toPar": -23,
        "strokes": 44
      }
    ],
    "officialPlacement": 6,
    "isTied": false
  },
  {
    "playerId": "c0707ed3-323f-4e0d-b119-99dd9790f8f4",
    "screenName": "GOMARINO13",
    "rounds": [
      {
        "toPar": -30,
        "strokes": 33
      },
      {
        "toPar": -27,
        "strokes": 36
      },
      {
        "toPar": -22,
        "strokes": 45
      },
      {
        "toPar": -19,
        "strokes": 48
      }
    ],
    "officialPlacement": 5,
    "isTied": false
  },
  {
    "playerId": "a0eaf23c-0784-4eb9-ab1d-530b077121a9",
    "screenName": "JESUNET",
    "rounds": [
      {
        "toPar": -29,
        "strokes": 34
      },
      {
        "toPar": -25,
        "strokes": 38
      },
      {
        "toPar": -16,
        "strokes": 51
      },
      {
        "toPar": -24,
        "strokes": 43
      }
    ],
    "officialPlacement": 8,
    "isTied": false
  },
  {
    "playerId": "83343490-426d-4275-a557-b1fab48b76f0",
    "screenName": "KD",
    "rounds": [
      {
        "toPar": -21,
        "strokes": 42
      },
      {
        "toPar": -18,
        "strokes": 45
      },
      {
        "toPar": -5,
        "strokes": 62
      },
      {
        "toPar": -8,
        "strokes": 59
      }
    ],
    "officialPlacement": null,
    "isTied": false
  },
  {
    "playerId": "235b5480-f2fe-4c81-b843-ff34743e882b",
    "screenName": "LAKE",
    "rounds": [
      {
        "toPar": -26,
        "strokes": 37
      },
      {
        "toPar": -25,
        "strokes": 38
      },
      {
        "toPar": -14,
        "strokes": 53
      },
      {
        "toPar": -15,
        "strokes": 52
      }
    ],
    "officialPlacement": null,
    "isTied": false
  },
  {
    "playerId": "9ac6ad68-7590-470d-8d35-122fcebed394",
    "screenName": "leanin2it",
    "rounds": [
      {
        "toPar": -28,
        "strokes": 35
      },
      {
        "toPar": -29,
        "strokes": 34
      },
      {
        "toPar": -18,
        "strokes": 49
      },
      {
        "toPar": -25,
        "strokes": 42
      }
    ],
    "officialPlacement": 4,
    "isTied": false
  },
  {
    "playerId": "b98df6d3-7e16-450f-bd17-f39d9903d1e1",
    "screenName": "lynniebodd",
    "rounds": [
      {
        "toPar": -26,
        "strokes": 37
      },
      {
        "toPar": -26,
        "strokes": 37
      },
      {
        "toPar": -13,
        "strokes": 54
      },
      {
        "toPar": -21,
        "strokes": 46
      }
    ],
    "officialPlacement": null,
    "isTied": false
  },
  {
    "playerId": "ba91585f-04b5-440a-a5fa-9e70352ece91",
    "screenName": "Maximus",
    "rounds": [
      {
        "toPar": -21,
        "strokes": 42
      },
      {
        "toPar": -26,
        "strokes": 37
      },
      {
        "toPar": -20,
        "strokes": 47
      },
      {
        "toPar": -20,
        "strokes": 47
      }
    ],
    "officialPlacement": null,
    "isTied": false
  },
  {
    "playerId": "db682f5a-3352-4490-a2cb-013573c8a1c0",
    "screenName": "Mully",
    "rounds": [
      {
        "toPar": -25,
        "strokes": 38
      },
      {
        "toPar": -26,
        "strokes": 37
      },
      {
        "toPar": -15,
        "strokes": 52
      },
      {
        "toPar": -21,
        "strokes": 46
      }
    ],
    "officialPlacement": null,
    "isTied": false
  },
  {
    "playerId": "c19d0b98-ed0b-462c-8b31-6b54221127d9",
    "screenName": "Neo Impossible",
    "rounds": [
      {
        "toPar": -24,
        "strokes": 39
      },
      {
        "toPar": -27,
        "strokes": 36
      },
      {
        "toPar": -20,
        "strokes": 47
      },
      {
        "toPar": -11,
        "strokes": 56
      }
    ],
    "officialPlacement": null,
    "isTied": false
  },
  {
    "playerId": "b48d4e30-de56-4864-b31d-e9b2880cee01",
    "screenName": "Nic79",
    "rounds": [
      {
        "toPar": -19,
        "strokes": 44
      },
      {
        "toPar": -20,
        "strokes": 43
      },
      {
        "toPar": -2,
        "strokes": 65
      },
      {
        "toPar": -5,
        "strokes": 62
      }
    ],
    "officialPlacement": null,
    "isTied": false
  },
  {
    "playerId": "ebcdd3f4-1a69-40f6-819e-899fbe9998d7",
    "screenName": "NUTTYGRANDPA",
    "rounds": [
      {
        "toPar": -19,
        "strokes": 44
      },
      {
        "toPar": -23,
        "strokes": 40
      },
      {
        "toPar": -11,
        "strokes": 56
      },
      {
        "toPar": -16,
        "strokes": 51
      }
    ],
    "officialPlacement": null,
    "isTied": false
  },
  {
    "playerId": "eb95bd85-5cee-437b-b458-abedf5a368d3",
    "screenName": "PAULV-PPP ��",
    "rounds": [
      {
        "toPar": -28,
        "strokes": 35
      },
      {
        "toPar": -25,
        "strokes": 38
      },
      {
        "toPar": -19,
        "strokes": 48
      },
      {
        "toPar": -15,
        "strokes": 52
      }
    ],
    "officialPlacement": null,
    "isTied": false
  },
  {
    "playerId": "cb01e4af-b57b-4424-a00f-7697f1c5f90f",
    "screenName": "PRINCESS_BANKSHOT",
    "rounds": [
      {
        "toPar": -24,
        "strokes": 39
      },
      {
        "toPar": -24,
        "strokes": 39
      },
      {
        "toPar": -18,
        "strokes": 49
      },
      {
        "toPar": -22,
        "strokes": 45
      }
    ],
    "officialPlacement": null,
    "isTied": false
  },
  {
    "playerId": "f52d69e7-f697-40b3-8344-492e70e3a11d",
    "screenName": "psitec#0",
    "rounds": [
      null,
      {
        "toPar": -24,
        "strokes": 39
      },
      {
        "toPar": -16,
        "strokes": 51
      },
      {
        "toPar": -5,
        "strokes": 62
      }
    ],
    "officialPlacement": null,
    "isTied": false
  },
  {
    "playerId": "8b29287c-0696-4cb9-8bb1-b161e0940808",
    "screenName": "Raccoons_whisker",
    "rounds": [
      {
        "toPar": -18,
        "strokes": 45
      },
      {
        "toPar": -17,
        "strokes": 46
      },
      {
        "toPar": 0,
        "strokes": 67
      },
      {
        "toPar": -12,
        "strokes": 55
      }
    ],
    "officialPlacement": null,
    "isTied": false
  },
  {
    "playerId": "ec943c83-bd7f-46b9-a9a9-8d2d6a3a71b0",
    "screenName": "Sj_76",
    "rounds": [
      {
        "toPar": -17,
        "strokes": 46
      },
      {
        "toPar": -2,
        "strokes": 61
      },
      null,
      null
    ],
    "officialPlacement": null,
    "isTied": false
  },
  {
    "playerId": "ee250925-578a-4b26-a549-c4dc88d42b23",
    "screenName": "Slabdaddy",
    "rounds": [
      {
        "toPar": -19,
        "strokes": 44
      },
      {
        "toPar": -25,
        "strokes": 38
      },
      {
        "toPar": -16,
        "strokes": 51
      },
      {
        "toPar": -12,
        "strokes": 55
      }
    ],
    "officialPlacement": null,
    "isTied": false
  },
  {
    "playerId": "036372cc-f3a5-4da9-aaa5-6edae9e6c1ca",
    "screenName": "STICKY",
    "rounds": [
      {
        "toPar": -25,
        "strokes": 38
      },
      {
        "toPar": -27,
        "strokes": 36
      },
      {
        "toPar": -16,
        "strokes": 51
      },
      {
        "toPar": -21,
        "strokes": 46
      }
    ],
    "officialPlacement": null,
    "isTied": false
  },
  {
    "playerId": "dfdd9e81-01ff-4284-b910-acdf41ee7bdd",
    "screenName": "StoneyMan69",
    "rounds": [
      {
        "toPar": -23,
        "strokes": 40
      },
      {
        "toPar": -23,
        "strokes": 40
      },
      {
        "toPar": 5,
        "strokes": 72
      },
      {
        "toPar": -5,
        "strokes": 62
      }
    ],
    "officialPlacement": null,
    "isTied": false
  },
  {
    "playerId": "aa804558-799e-46c0-8971-b51ff4bd38de",
    "screenName": "STROKELIMITREACHED",
    "rounds": [
      {
        "toPar": -24,
        "strokes": 39
      },
      {
        "toPar": -26,
        "strokes": 37
      },
      {
        "toPar": -27,
        "strokes": 40
      },
      {
        "toPar": -12,
        "strokes": 55
      }
    ],
    "officialPlacement": null,
    "isTied": false
  },
  {
    "playerId": "55d9c7f0-ba6b-4245-91de-a90189276744",
    "screenName": "The Real JB",
    "rounds": [
      {
        "toPar": -23,
        "strokes": 40
      },
      {
        "toPar": -27,
        "strokes": 36
      },
      {
        "toPar": -13,
        "strokes": 54
      },
      {
        "toPar": -17,
        "strokes": 50
      }
    ],
    "officialPlacement": null,
    "isTied": false
  },
  {
    "playerId": "726a43ea-f061-41e9-8505-cda3f589dcab",
    "screenName": "TIGERHOODS",
    "rounds": [
      {
        "toPar": -26,
        "strokes": 37
      },
      null,
      null,
      null
    ],
    "officialPlacement": null,
    "isTied": false
  },
  {
    "playerId": "6f38b6b4-46bf-4ae6-9bb5-2230be6fb3f4",
    "screenName": "TRICKYDICKY",
    "rounds": [
      {
        "toPar": -28,
        "strokes": 35
      },
      {
        "toPar": -26,
        "strokes": 37
      },
      {
        "toPar": -22,
        "strokes": 45
      },
      {
        "toPar": -25,
        "strokes": 42
      }
    ],
    "officialPlacement": 3,
    "isTied": false
  },
  {
    "playerId": "1ce077b9-5d7a-49ae-bbcd-a714a443af4f",
    "screenName": "UroPa",
    "rounds": [
      {
        "toPar": -23,
        "strokes": 40
      },
      {
        "toPar": -22,
        "strokes": 41
      },
      {
        "toPar": -20,
        "strokes": 47
      },
      {
        "toPar": -11,
        "strokes": 56
      }
    ],
    "officialPlacement": null,
    "isTied": false
  },
  {
    "playerId": "e093fb15-b91d-4fc1-9c9f-3fa9b6b94058",
    "screenName": "Warey84",
    "rounds": [
      {
        "toPar": -25,
        "strokes": 38
      },
      {
        "toPar": -26,
        "strokes": 37
      },
      {
        "toPar": -17,
        "strokes": 50
      },
      {
        "toPar": -7,
        "strokes": 60
      }
    ],
    "officialPlacement": null,
    "isTied": false
  },
  {
    "playerId": "7befb54f-6eec-4c7c-9881-c75d1acfb8d8",
    "screenName": "Wendyw",
    "rounds": [
      {
        "toPar": -16,
        "strokes": 47
      },
      {
        "toPar": -12,
        "strokes": 51
      },
      {
        "toPar": -1,
        "strokes": 66
      },
      {
        "toPar": -14,
        "strokes": 53
      }
    ],
    "officialPlacement": null,
    "isTied": false
  },
  {
    "playerId": "797063d6-62f9-414f-bd92-e18780ed8e52",
    "screenName": "WILMA_FINGERDOO",
    "rounds": [
      {
        "toPar": -22,
        "strokes": 41
      },
      {
        "toPar": -30,
        "strokes": 33
      },
      {
        "toPar": -12,
        "strokes": 55
      },
      {
        "toPar": -10,
        "strokes": 57
      }
    ],
    "officialPlacement": null,
    "isTied": false
  },
  {
    "playerId": "9a3b0702-8240-400f-afab-00b5412192c7",
    "screenName": "YANKEEDUDE1123",
    "rounds": [
      {
        "toPar": -21,
        "strokes": 42
      },
      null,
      null,
      {
        "toPar": -12,
        "strokes": 55
      }
    ],
    "officialPlacement": null,
    "isTied": false
  },
  {
    "playerId": "21be1be9-9b32-4f82-9c48-b0811e0f975e",
    "screenName": "YUK1N",
    "rounds": [
      {
        "toPar": -24,
        "strokes": 39
      },
      {
        "toPar": -24,
        "strokes": 39
      },
      {
        "toPar": -16,
        "strokes": 51
      },
      {
        "toPar": -23,
        "strokes": 44
      }
    ],
    "officialPlacement": null,
    "isTied": false
  },
  {
    "playerId": "2e4ce1d8-afd6-44a2-9560-f85c16f23747",
    "screenName": "ZANETTI",
    "rounds": [
      {
        "toPar": -30,
        "strokes": 33
      },
      {
        "toPar": -27,
        "strokes": 36
      },
      {
        "toPar": -23,
        "strokes": 44
      },
      {
        "toPar": -26,
        "strokes": 41
      }
    ],
    "officialPlacement": 2,
    "isTied": false
  },
  {
    "playerId": "7a9466f0-afe6-46e3-870c-59819c194e63",
    "screenName": "ZONK",
    "rounds": [
      {
        "toPar": -27,
        "strokes": 36
      },
      {
        "toPar": -27,
        "strokes": 36
      },
      {
        "toPar": -20,
        "strokes": 47
      },
      {
        "toPar": -19,
        "strokes": 48
      }
    ],
    "officialPlacement": 9,
    "isTied": true
  },
  ...MASTERS_PREVIEW_NEVER_PLAYED.map((player) => ({
    playerId: player.playerId,
    screenName: player.screenName,
    rounds: [null, null, null, null] as const,
    officialPlacement: null,
    isTied: false,
  }))
]

export function summarizeMastersPreview(players: readonly MastersPreviewPlayer[] = MASTERS_PREVIEW_PLAYERS) {
  const eligible = players.filter((player) => player.rounds.some(Boolean))
  const neverPlayed = players.filter((player) => !player.rounds.some(Boolean))
  const vipQualifiers = eligible
    .filter((player) => player.officialPlacement !== null && player.officialPlacement <= 10)
    .sort((left, right) => left.officialPlacement! - right.officialPlacement! || left.screenName.localeCompare(right.screenName))
  return {
    eligible,
    neverPlayed,
    vipQualifiers,
    eligibleCount: eligible.length,
    neverPlayedCount: neverPlayed.length,
    placementComplete: eligible.every((player) => player.officialPlacement !== null),
  }
}

export function totalStrokes(player: MastersPreviewPlayer) {
  return player.rounds.reduce((total, round) => total + (round?.strokes ?? 0), 0)
}

export function totalToPar(player: MastersPreviewPlayer) {
  return player.rounds.reduce((total, round) => total + (round?.toPar ?? 0), 0)
}

