// Lyceum Placements — Placement Management System
// Copyright © Bhanu Mendis - LGH IT
package webpush

import "strings"

// crossVectors were produced by http_ece 1.2.0, the encryption library under the npm web-push
// package the push-dispatch Edge Function used, with random keys and salts (each checked by
// http_ece's own decrypt before being recorded). They pin byte-for-byte agreement with the
// implementation browsers' push messages were encrypted with until now.
var crossVectors = []vector{
	{
		name:      "http_ece: JSON notification",
		plaintext: "{\"id\":\"n1\",\"title\":\"Course Information Sheet due on LPL-2026-0042\",\"body\":null,\"link\":\"#/case/c42/step/4\"}",
		asPrivate: "kswkC8SNz_M3lBURexNqR__8DtL1X2nngZU9ZGPB6qw",
		uaPrivate: "sNKrNjZ_5ZYAD8MLg1bprG2KUByU9qbvnI1CEdnRxWI",
		uaPublic:  "BD3j-B00Q73hPkIvSVJ5CjWy9ejJTLBrhhikaLPpDjVaX_HvCTOhk-5ZMcFDSk7GdZLsJ_YnWJ6DcLnrl1cuha8",
		auth:      "AyfhlOj1hoc6UmjxCx619w",
		salt:      "loIox-kRBnicREw18lUISw",
		message: "loIox-kRBnicREw18lUISwAAEABBBMZA2wY3qTXzjjSl-ZPeK8Bp8k0S_r5Gpq8BF21RL_WHGY5Ndk3bySJ34bVKR9DK0cfExfFusFTLccVg6I6phO7Vb86n" +
			"zlIpr6spM6ZTpYYPOlK8jj8yEAebVD1fRWy9Hi-UI8HEiPJfsUbUej6a83bFtPMBDFvaoseabNdZYz6n5LAHXtzF-_KIHhisaQgg3QdHNr2ppRtM3iQoCfYf" +
			"MPorn7KhtTlLsktRkFvZySbjkNK_n_gr0RfucJo",
	},
	{
		name:      "http_ece: one byte",
		plaintext: "x",
		asPrivate: "cEUMUbt-Do7MOGgc6Re-3SeTdHdOks6rxNiQMSle60Y",
		uaPrivate: "lgPYnG-x1BzxpG2Ht5V3i1wg6PAl9otvFk_FBOpQcR0",
		uaPublic:  "BIxUSzK92OCixbG-qQ9Zzs13wz4OvzZaaff4oHAgUzkEe8T7pAvDOLYBRQq9oQ85wyMUo6LAQwT2BlS_RSuPKn0",
		auth:      "QCTMRFTQ7JKO7U9wXV7Jzw",
		salt:      "OAraS2gRuVY0x1KuKbFzMA",
		message: "OAraS2gRuVY0x1KuKbFzMAAAEABBBHG9lm4J5vv9SLCjZ-94TJ0oFVkzUI5LVY2fIGcy6mLCN13mbK3-fi5vLGP3kIkkOFnUyoDJVAzhcW7rj5BL_wX4JZZr" +
			"ocahlpr2vv99eHHBqU0",
	},
	{
		name:      "http_ece: near the size limit",
		plaintext: strings.Repeat("L", 3900),
		asPrivate: "f6LtH9WJWVOPAtrzK6OTov2LObxfYb9z13r3J_w_qUY",
		uaPrivate: "4_KampMeVm6afhRctVmumEmsCQLRDwevHJiVox1XL2Q",
		uaPublic:  "BOAtK2WDOJsZ59-JZivtLKVUZyH7pEOuXkews67Qv25XdWtC1MDp6a9g-kezBM7XPBE03DU-oRvAhWxXJQUuFZE",
		auth:      "9Kj2ann4id2caghmI8VdnA",
		salt:      "75TXqMmY1qXqL17-0ife_w",
		message: "75TXqMmY1qXqL17-0ife_wAAEABBBFJWS9RBk4e43_pyUuHlkhU-S_cnA-vizCqHKM2OrLDbUTUN23K2JQOgVoLir9N26GM5gFPGMx4oTjGRtf8Oxc2rwxx8" +
			"tXYMtlYMmno_oPs75Bd1-kxtZfVMnefONFoOSB-IDLaLucr45HYMkkFgxlXOfS4x7dIN9rbdqXiVzkxnZyq_XYUvq-jOY68VAHCBSITzu8yz4dGpnWrv-NHn" +
			"h0t3ITJgMVp2ZjM71fh3mnBDC9KKrnK2FvlT095GU09YAPFKBx88xv_zFy-9LzGG2jdF9v9YjCnSFZ5JTbRuBj363X9HfiaSPPbjapy662yqVHy-6oW-PBat" +
			"X_tROKYRRIdikm1TrjpL7ZCpMoCaqsAsHPAaSbBVXzZESmE1wzsXWCuzLwqSmc218Sdn8le_xfrqyW4w-MAaFPnNXuniHsAU4utpgi0rqjUedGcd06GuQNko" +
			"jfhRd6YFG2fHfWqc2LhIjsuC3h7DLvlwa0HU2qUpVRUAdUSP9RcX0TfoT532SuIeq83WRYxcGQtr3_QBJ64vlOmRHzoRKv4ZFJhcTmVNTUfodUMdtQySIKQh" +
			"3xT05m2WHbrGspcmjswFDnRYMI0VLYQoVrmdBKW6x33A8dPtmygXTwidM8822ZWlnGFYVkpXfMa4rya-4deqeZZOVbeNNMW_-eJBBS5bRAgjkSYQyiPa-Guh" +
			"7WKmmX2CnnmdyRXo2yL-WID-Y_g_QhGTFElbliUX_99VITmGUREJBH1rreJNiYobHr55hqeKXaC7dhn_Y4O9J0_Kmx4PEDpY7vuNSGEEmiYL1YdLqE2hx5eu" +
			"seA9J9ZW4bkx7NnyK-y0Q9yBnmCbetDy-T1W1d2t2db_B0y8ksX1DuLcjBoE-IjnJwvQjaP_V-D2I4kbUMHWlhAWkATGUxx_rp-cFLhSH9QkeebIgQw5OGnS" +
			"3vZylq6ZaNJKh6m8XLQYnwFsGYKGptYAzfufeVl4ypQZ8nRXemtF41vx0HY98ZJvjitew6B5SBP2ef5j_lo_f3-X397ueLNTR3wLtV7DuCFA71Nz97u5gQV2" +
			"Vm_6i1OBgddEymLNdZsdxe4fWsoAH0pDZK0WrZGxbinKJic9FKT34FtnxqzRKOxDwP_MVRX4qXpGeH-ooPfrUEN0zXfAZMJMWfSpZzjljLHtm8StX5G7MKOj" +
			"f5YnDYauC5FEquwx_-LfFMH9mmQJZuLnp4Heinj7MOGd9KRSe9hO8Th682jP5rECoO5AKcHTAz2fHZsqh2QGoJ83998gdBm8NUr6FcZR6gdSjhDjHV7tzHNP" +
			"q1n8haYEKLkRzC4-1bKmWL4Knpe4HyIFS5auReJK65-INw44x3p27xtqVfg9HPfaEcJfAqy4De4xSlKgCdzLjvamdpht06ZxS6h0CE-LO_frFsxs8ZJzToVS" +
			"bS0ERjQhqMKzR-n-UUqy9i6Tfs5T7SDHu_Ii0H_SCnUdDpkE4N6ec-fqMJ1Y6Uz_wbIFEsDbryYQhK09LTgTrFhRSMgiBu6B5UpOUzWbxynciQpSgPnFg-qf" +
			"v1jFmlelXclH90DUTLi0Tc99kbQcvhXnbaYe2YLG6K1SuTM4Wy7dy1J6OjbJqMf9PzN6_rwIflvyogwRR4XWWZ5ynwcFnYiC2bbKHZcH6VQNRRx4xWh9VvMJ" +
			"Bg6XUxqBDlgAsJ6kjtdiubsEYN3J8FTJpdZZ6EWIw3BohAkdU6cfpJK--fyGQyfLh6E5b5wkLOsRZNKKvflLfVtCtsNnhNkfcB5gB-m7UvGb1F8iYEcH3bx2" +
			"Q-FLY7EW02-SE1j4sEUzRN2HnwBKUGjYz4dRX2HPVGYRns-idbaTbw51b3KXvR54LT3Iw5RQxcj_ig-sXfl5bfCVJPs6c26fBjwzHFyBj6Bz7nI9sETQqxw-" +
			"imZ0g-D0ETbvAw-IV_udTzMGlNzaNFmaYauHrBfpZo3QtL6zvJb6SaknKG98NALwyIshyIObAVD3dlipwvhioAf_lLjmzTdkXEEGzmjAHl1MQlqNVNojAxyo" +
			"ndvUrrZZUFcXVO9-u5ZWRILHbPNRIiuX-UMasgiH_rSLtq0hH5HIRyYG9-rpZIVfej2D9pqL0vqzOgwLLINhlXhcR2HRFebHRQft1GPTvsNivcxDBJ2FUwfP" +
			"mgnYqf-WmiFCcXHvcnW3uABIGodqBegDXvRgybEqWlBSmh2YKofQS_LKLW9JkTaOxxLcIqD8LoLLUgVPkZ8QqNLUsKg89sMhjneOzQbhJiJJ0AEmFTPBcd9z" +
			"5-4YVSBxkg3zsXT1YzLAmbXkgE4xzxCzsfL2GsiCZwq-fe_-CZxB7Zga517MNLOREnDOY-sUKu8af-33hz7dB08nt7e73dqZpWhrbGUY5mGQOZSNaYwea0mH" +
			"h-TJkEs4p8lmNhnYAZzkes9HkA5FHu-QtDJBLB1YplhShj4N1PNTwcOSJ7sRLOSJpyEDa0wriwf_IZYatDLZ5YGMREQamW3cdRXkaoN1_QXaKzaELL9pLsN9" +
			"2NvheSQh5Ny6e5igEqHDfSO00xu2TDGiIo2BMXX0IT0S5y4b8p7Ny_cn2-e2LuEkw7_BOA1mowQctQ2HWgZJPJ4fjuwAH74_7LB2cpEKUKdS6SrqI8plJNZ2" +
			"vxbY6StNqhL6ihNQrTYgdExZSj8x0KLR3h2up78CpswBnrVfhmSHTV6CBs9lWkQ77Zay64eWXvO7YXzweJii71QHSWpqW0Mrb-WoGONOSVy2RD79kdSiPbS0" +
			"X7c5Q-Y5sL_eZDxAIFreK9udaDH3yu5tUfE3uPncTRYO6mY3UcuPHs5J2Y8wjjBdM_mENZH8WGZuCs24vy0KPkaJ01vFAzkHj3pk-Ii8qw4zh505Y8rBR5Zy" +
			"ybkJIu2LAYD5zDYiy5v12PNA_--y5fkaaZ3lNgGGHZlzh-1In2eMQaz9-1wT1T317UWaQCKEWMzFzMl43C7dqnhuvrMjLxLYbRDLMvVpHfl1HK_HWCzpNQ5A" +
			"fUglzFX9NarKa-_DvGXlUc_wPgnftZRxGp6t-2pLUuFevAms5cu2W2EsqYziGioeQa8EpYrzyyD0_rMCRnNKKnrR_v-wqfsSq3h6JFLux3N4Moim3iFMRdBY" +
			"Y6xP6NiS4nF8dtre97hiKw8sWvWGOCOES8E1e0riGtSqRXvz0KC1HySVXK2I2fHPD481Mmwpp053Q27WEJZemjLa1L78GPUy3vpqvIWw0Q8FQjmCwpNQ9tbr" +
			"PenXHo-7p2r5hXLHYgtO5ErGyaOwFay6VsFsGxuvuFP3BNGVia5NAHjRd54dBNZnSEJFOLL5jQqiHRE4x_y7HHjqYdQH1qRGqLqWBkmk8Djuh_aQadT-SL9x" +
			"Gd0z2jFSXutzu9r8cDij00GZVZ1GxgasOHmKD_T19hiBzs1eE9fE8Xt_zyVTxBY6ds6MOxHbseyTp5-jigpgSjTutzZl6gaFBArrbGWKxoax0l83HpECwE60" +
			"UFEkVV04niF8J5PMs7XB26XS4QeBjJ-fppq-9UgIq97iM0IwFUR-ykMs6tmuv05dlNd-LWZLeDW-GnhNnMl63oiEk6vT4BtuIfvinqA7jb9XMEgf2JoSV7dK" +
			"IF8EBM3FN9vguvxfGlKs9GlGdHcrbRfQbpCxyar0TQf6G8EXk-QfelOYGAjx4dS7yXQNt_opDacC070F8PHctOiLoUkk-6LOe1dLSJiOM0fNpTEMHNAxT-ER" +
			"tFHf985Xw-ZSarlsHVtdNdmX7azby6JhpC6GSDo3D3MyR5dyzHbEpYl9Txn2-sOgS-oy2BeTp2XhF-Whkg9Flu3ubxVu5WFRTSP3jOnODwuBJbW3sMWk7iL4" +
			"UVdqoG8O9MNabP8_3Lz2RXJtIwRDhPcW3z2nYjDIx1isAQF3KazHTyybWrSm1hQn2MKw5O6q_qqxBcIywX81PFW6BsfpPoC_pdQ0KIRLUEYkGl0cSgB5mhly" +
			"8hJrBi-qHStMQn516MDe9rzfgs0gavPRXKpd5cf5g6Qm9Ed4WQ7dpRvZOQaToWEfnMHdXBPvQpmWBsodi7YLx6QgR7MHgTrQgHv9jgc8J_DKShr0vUCHW0l6" +
			"Yx5FPzW6ITfPEyh1TTd9xGgJT9sTtmai1jsMxhFrw6juZIiOayqvRt3fKoUReC-v4zje3vON3dHpYEj2tBdpNmXPIiohE14DU8DJaEG9CR9I9I5ije2iEgm_" +
			"09sXn2V3ny1zMlFR6zKOjtXWNNkmQ51qJ9mVv6LsTZd9nqJ9F2MlgQWTL633oGOdpHVBVdWwwx0K86AiIrIKlm7gzJp6hhVUxD8T04qFZPvdTntlJWzGkk6W" +
			"8NhiTZ2ZPaY57cUDguKM8a5wOYTYi47ovOyaVyGzAbqvDmdMRw3wGVy5XOLSVQBLrPw3a_CubXVFYRP0FAJvGkMokyeCwDjGMJOaOdtpvHlls8FJHYID6S5C" +
			"CDibDI78-CWNvR-3tuaIjv0-1pAsCHeMMG_lPr-iOmtvCns_dGEhACRxMfbWo2xlFoxqBIxh-W39ph9rDSbxJDfEsraTkbdFKSQdAJP5TCcPFRPFJRQPHvoy" +
			"oGCWMI7olamsppVY2wMGUvLUKKjcS3gGV2CroOiNdjgu83kct-y0E5eD6O7IoZ3pP0KySWx8_R1Gc7_Lz6HcIKe52q_2-P6rkWvmmi6VMiZHpQrRcQeMXk8c" +
			"NlWcvR43nmbPrWnTMnTxZLmABQ6xpVvj0NSL6hJVVZuv5Gg6VnJNv51m6LBML7xXsLdV_BEsedA77rl74CnI9KOFKAGrHRJpJ3Xbet1Gwh8eI00Z9qHuydt8" +
			"huCNpqDgRkVf7nChLPdJluMWXxvHOML8GqJi0wJ_RxAA3Wl-AcGHUkEjA4Wq_BomDMDODtxLvkbf-RtkMuwdW3LiF5yllL5UCbgXl-reGNwSqwOgxdHGX707" +
			"RN5OATdikN5KpekrKxOe7i8S2Vz7Pw9eNvDXkB_Zo7SrKxN3MELzLLUm_FWoDVo2zwjVpzVjxtjQMiYS69kTPIb6rgKaYPAXu2Sr1zcqDm0k9psAuYpXkjs6" +
			"X3y3-VdVQtgaWN8Mzmx7Gu7PuNNBM0om-_BJpcbmBcBbOM9yfGXtsp2dBCx_KPgFsJo-mFOJI28S3kS4lbnP-tfER-lc4guCtc2Bi7WiIQ1RiTbR2eKk5-9b" +
			"f-IzPb5ZePIFxnsl-BrqHp2BzXn-64Y3MNENmWNGzBJSlLQ1ry5jcbb8FxXlxeHrTRLeT6DbfYn-pDxp7YaEB9VSZ19Wbsvn_JEvJSBu0mhAo-axKqie8un8" +
			"NqH3soEsTMhnZ1HgCapVgxZQS1VPUrMIcdAlPZN8zJACuE7ClxfUP8bg4w",
	},
}
