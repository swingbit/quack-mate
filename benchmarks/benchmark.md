Starting Benchmark at Max Depth 4 + QS 0, with 1 Threads...

### Board: Perft Pos 1 (Start): rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1
| Config | Move | Score | Nodes | Time (ms) | Peak RSS (MB) |
|---|---|---|---|---|---|
| Recursive (Exhaustive) | b1c3 | -10 | 206604 | 4888 | 628.1 |
| ID (Exhaustive) | b1c3 | -10 | 216365 | 4786 | 1217.4 |
| BPVS (ID + AB + LMP + Batches) | g1f3 | 0 | 57698 | 3013 | 641.9 |
| + MVVLVA | g1f3 | 0 | 57698 | 3070 | 627.7 |
| + TT | g1f3 | 0 | 52514 | 2874 | 608.8 |
| + PST | b1c3 | -10 | 29039 | 2408 | 544.3 |
| + Killers | b1c3 | -10 | 29038 | 2565 | 552.2 |
| + History | b1c3 | -10 | 29038 | 2456 | 548.9 |
| + RFP | b1c3 | -10 | 29038 | 2521 | 545.3 |
| + FFP | e2e4 | 0 | 15843 | 2278 | 470.4 |
| + LMR | e2e4 | 0 | 15843 | 2130 | 468.1 |
| JS DFS Reference | b1c3 | -10 | 1750 | 123 | 245.2 |


### Board: Perft Pos 2 (Complex Mid-game): r4rk1/1pp1qppp/p1np1n2/2b1p1B1/2B1P1b1/P1NP1N2/1PP1QPPP/R4RK1 w - - 0 10
| Config | Move | Score | Nodes | Time (ms) | Peak RSS (MB) |
|---|---|---|---|---|---|
| Recursive (Exhaustive) | c3d5 | -170 | 3984805 | 76679 | 9133.5 |
| ID (Exhaustive) | c3d5 | -170 | 4078946 | 46664 | 14859.9 |
| BPVS (ID + AB + LMP + Batches) | d3d4 | -170 | 173428 | 5116 | 2253.2 |
| + MVVLVA | c3d5 | -170 | 25797 | 2506 | 1638.3 |
| + TT | c3d5 | -170 | 24797 | 2542 | 1628.4 |
| + PST | c3d5 | -170 | 27237 | 2515 | 1647.4 |
| + Killers | c3d5 | -170 | 27237 | 2558 | 1660.6 |
| + History | c3d5 | -170 | 27237 | 2555 | 1631.7 |
| + RFP | c3d5 | -60 | 9572 | 2359 | 1568.8 |
| + FFP | g5f6 | 260 | 8336 | 2427 | 1582.2 |
| + LMR | d3d4 | -160 | 23655 | 2703 | 1663.9 |
| JS DFS Reference | c3d5 | -170 | 1476 | 106 | 1346.9 |


### Board: Perft Pos 3 (KiwiPete): r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1
| Config | Move | Score | Nodes | Time (ms) | Peak RSS (MB) |
|---|---|---|---|---|---|
| Recursive (Exhaustive) | f3f6 | 725 | 4002708 | 85846 | 9370.6 |
| ID (Exhaustive) | e2a6 | 65 | 4100812 | 53394 | 14886.9 |
| BPVS (ID + AB + LMP + Batches) | e2a6 | 65 | 88727 | 3963 | 1866.7 |
| + MVVLVA | e2a6 | 65 | 25240 | 2544 | 1587.9 |
| + TT | e2a6 | 65 | 25862 | 2760 | 1594.1 |
| + PST | e2a6 | 65 | 26263 | 2742 | 1596.9 |
| + Killers | e2a6 | 65 | 26261 | 2549 | 1589.3 |
| + History | e2a6 | 65 | 26263 | 2646 | 1587.9 |
| + RFP | e2a6 | 75 | 24900 | 2680 | 1608.0 |
| + FFP | e2a6 | 0 | 18998 | 2687 | 1605.2 |
| + LMR | e2a6 | 65 | 8959 | 2360 | 1530.0 |
| JS DFS Reference | e2a6 | 75 | 2195 | 123 | 1316.9 |


### Board: Perft Pos 4 (Endgame): 8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1
| Config | Move | Score | Nodes | Time (ms) | Peak RSS (MB) |
|---|---|---|---|---|---|
| Recursive (Exhaustive) | b4f4 | 10 | 46103 | 1407 | 1440.4 |
| ID (Exhaustive) | b4f4 | 10 | 49336 | 3034 | 1710.4 |
| BPVS (ID + AB + LMP + Batches) | b4f4 | 10 | 10574 | 2105 | 1537.3 |
| + MVVLVA | b4f4 | 10 | 11542 | 2086 | 1523.3 |
| + TT | b4f4 | 10 | 8886 | 2110 | 1532.4 |
| + PST | b4f4 | 10 | 7608 | 2094 | 1537.4 |
| + Killers | b4f4 | 10 | 6037 | 2098 | 1527.7 |
| + History | b4f4 | 10 | 6037 | 2166 | 1524.9 |
| + RFP | b4f4 | 10 | 6037 | 2124 | 1519.1 |
| + FFP | b4f4 | 10 | 5570 | 2264 | 1518.7 |
| + LMR | b4f4 | 10 | 5570 | 2328 | 1514.7 |
| JS DFS Reference | b4f4 | 10 | 945 | 33 | 1310.2 |


================================================================================

## QUIESCENCE SEARCH (QS) VS. DEPTH +1 COMPARISON

### Board: Perft Pos 1 (Start): rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1
| Config | Move | Score | Nodes | Time (ms) | Peak RSS (MB) |
|---|---|---|---|---|---|
| BPVS + LMR (4 + QS=0) | e2e4 | 0 | 15843 | 2217 | 1537.1 |
| BPVS + LMR (4 + QS=1) | d2d4 | 0 | 26966 | 4310 | 1797.2 |
| BPVS + LMR (4 + QS=2) | d2d4 | 0 | 33470 | 5426 | 1893.5 |
| BPVS + LMR (5 + QS=0) | b1c3 | 140 | 114062 | 5350 | 2070.6 |
| JS DFS (4 + QS=0) | b1c3 | -10 | 1750 | 112 | 1328.7 |
| JS DFS (4 + QS=1) | d2d4 | 0 | 2220 | 181 | 1331.0 |
| JS DFS (4 + QS=2) | d2d4 | 0 | 2314 | 185 | 1331.0 |
| JS DFS (5 + QS=0) | b1c3 | 110 | 3801 | 203 | 1331.0 |


### Board: Perft Pos 2 (Complex Mid-game): r4rk1/1pp1qppp/p1np1n2/2b1p1B1/2B1P1b1/P1NP1N2/1PP1QPPP/R4RK1 w - - 0 10
| Config | Move | Score | Nodes | Time (ms) | Peak RSS (MB) |
|---|---|---|---|---|---|
| BPVS + LMR (4 + QS=0) | d3d4 | -160 | 23655 | 2721 | 1643.5 |
| BPVS + LMR (4 + QS=1) | g5f6 | 260 | 36942 | 4132 | 1806.6 |
| BPVS + LMR (4 + QS=2) | c3d5 | 85 | 227055 | 10434 | 2428.9 |
| BPVS + LMR (5 + QS=0) | c3d5 | 85 | 247169 | 10033 | 1689.6 |
| JS DFS (4 + QS=0) | c3d5 | -170 | 1476 | 104 | 251.9 |
| JS DFS (4 + QS=1) | e2d2 | 255 | 9913 | 664 | 253.4 |
| JS DFS (4 + QS=2) | c3d5 | 85 | 5424 | 494 | 253.4 |
| JS DFS (5 + QS=0) | c3d5 | 410 | 4829 | 255 | 253.4 |


### Board: Perft Pos 3 (KiwiPete): r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1
| Config | Move | Score | Nodes | Time (ms) | Peak RSS (MB) |
|---|---|---|---|---|---|
| BPVS + LMR (4 + QS=0) | e2a6 | 65 | 8959 | 2090 | 448.7 |
| BPVS + LMR (4 + QS=1) | e2a6 | 270 | 35031 | 4249 | 669.3 |
| BPVS + LMR (4 + QS=2) | e2a6 | 70 | 313404 | 13459 | 2063.0 |
| BPVS + LMR (5 + QS=0) | e2a6 | 365 | 70415 | 5168 | 804.9 |
| JS DFS (4 + QS=0) | e2a6 | 75 | 2195 | 115 | 250.2 |
| JS DFS (4 + QS=1) | e2a6 | 270 | 6826 | 469 | 251.0 |
| JS DFS (4 + QS=2) | e2a6 | 75 | 13004 | 1129 | 251.0 |
| JS DFS (5 + QS=0) | e2a6 | 375 | 7322 | 351 | 251.2 |


### Board: Perft Pos 4 (Endgame): 8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1
| Config | Move | Score | Nodes | Time (ms) | Peak RSS (MB) |
|---|---|---|---|---|---|
| BPVS + LMR (4 + QS=0) | b4f4 | 10 | 5570 | 2009 | 418.6 |
| BPVS + LMR (4 + QS=1) | e2e3 | 35 | 33169 | 4162 | 688.7 |
| BPVS + LMR (4 + QS=2) | e2e3 | 10 | 29551 | 4935 | 713.2 |
| BPVS + LMR (5 + QS=0) | b4f4 | 110 | 37539 | 3647 | 596.1 |
| JS DFS (4 + QS=0) | b4f4 | 10 | 945 | 35 | 244.5 |
| JS DFS (4 + QS=1) | e2e4 | 75 | 2608 | 88 | 250.3 |
| JS DFS (4 + QS=2) | b4f4 | 10 | 3011 | 108 | 250.2 |
| JS DFS (5 + QS=0) | b4f4 | 110 | 2827 | 79 | 250.2 |
