Precomputed tables initialized.
Starting Benchmark at Depth 5 with 1 Threads (Batch Size: 1)...

### Board: Perft Pos 1 (Start): rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1
| Config | Move | Score | Nodes | Time (ms) | Peak RSS (MB) |
|---|---|---|---|---|---|
| Recursive (Exhaustive) | d2d4 | 110 | 5071234 | 191074 | 49935.5 |
| ID (Exhaustive) | d2d4 | 110 | 5287598 | 87165 | 49069.1 |
| BPVS (ID + AB + LMP + Batches) | d2d4 | 110 | 762804 | 22003 | 10367.7 |
| + MVVLVA | d2d4 | 110 | 762804 | 21700 | 3327.5 |
| + TT | d2d4 | 110 | 487263 | 16709 | 3289.9 |
| + PST | d2d4 | 110 | 396882 | 14744 | 2410.1 |
| + Killers | d2d4 | 110 | 397887 | 14844 | 2261.5 |
| + History | d2d4 | 110 | 397927 | 15028 | 2276.8 |
| + RFP | e2e4 | 110 | 657310 | 20484 | 3102.7 |
| + FFP | d2d4 | 110 | 150013 | 10728 | 3102.7 |
| + LMR | d2d4 | 110 | 149702 | 9189 | 1535.7 |
| Standard (DFS Reference) | b1c3 | 110 | 3801 | 206 | 1519.1 |


### Board: Perft Pos 2 (Complex Mid-game): r4rk1/1pp1qppp/p1np1n2/2b1p1B1/2B1P1b1/P1NP1N2/1PP1QPPP/R4RK1 w - - 0 10
| Config | Move | Score | Nodes | Time (ms) | Peak RSS (MB) |
|---|---|---|---|---|---|
| Recursive (Exhaustive) | - | - | - | - | OOM |
| ID (Exhaustive) | - | - | - | - | OOM |
| BPVS (ID + AB + LMP + Batches) | c3d5 | 410 | 2864188 | 99000 | 10565.0 |
| + MVVLVA | c3d5 | 410 | 987318 | 47524 | 10565.0 |
| + TT | c3d5 | 410 | 945635 | 46674 | 4003.3 |
| + PST | c3d5 | 410 | 907583 | 44362 | 3927.8 |
| + Killers | c3d5 | 410 | 907525 | 45547 | 3803.2 |
| + History | c3d5 | 410 | 907121 | 45729 | 3803.2 |
| + RFP | c3d5 | 410 | 68591 | 24242 | 3802.7 |
| + FFP | c3d5 | 330 | 3629125 | 141625 | 12674.8 |
| + LMR | c3d5 | 330 | 2398457 | 89865 | 12596.1 |
| Standard (DFS Reference) | c3d5 | 410 | 4829 | 245 | 7856.7 |


### Board: Perft Pos 3 (KiwiPete): r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1
| Config | Move | Score | Nodes | Time (ms) | Peak RSS (MB) |
|---|---|---|---|---|---|
| Recursive (Exhaustive) | - | - | - | - | OOM |
| ID (Exhaustive) | - | - | - | - | OOM |
| BPVS (ID + AB + LMP + Batches) | e2a6 | 445 | 9871060 | 316495 | 21291.7 |
| + MVVLVA | e2a6 | 445 | 7608214 | 239451 | 21256.0 |
| + TT | e2a6 | 445 | 7616727 | 244181 | 20422.6 |
| + PST | e2a6 | 445 | 7009867 | 182953 | 20213.4 |
| + Killers | e2a6 | 445 | 7011559 | 182971 | 20122.8 |
| + History | e2a6 | 445 | 7019612 | 184983 | 19989.9 |
| + RFP | e2a6 | 170 | 493386 | 21511 | 19798.0 |
| + FFP | e2a6 | 170 | 420911 | 20232 | 2928.1 |
| + LMR | e2a6 | 170 | 355845 | 17541 | 2801.2 |
| Standard (DFS Reference) | e2a6 | 375 | 7322 | 337 | 2807.4 |


### Board: Perft Pos 4 (Endgame): 8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1
| Config | Move | Score | Nodes | Time (ms) | Peak RSS (MB) |
|---|---|---|---|---|---|
| Recursive (Exhaustive) | b4f4 | 110 | 716960 | 25289 | 8235.2 |
| ID (Exhaustive) | b4f4 | 110 | 766295 | 18498 | 7101.7 |
| BPVS (ID + AB + LMP + Batches) | b4f4 | 110 | 217111 | 9661 | 3253.8 |
| + MVVLVA | b4f4 | 110 | 264874 | 10153 | 1533.5 |
| + TT | b4f4 | 110 | 226736 | 9986 | 1533.5 |
| + PST | b4f4 | 110 | 163002 | 9079 | 1398.6 |
| + Killers | b4f4 | 110 | 176514 | 9200 | 1205.3 |
| + History | b4f4 | 110 | 176458 | 9308 | 1222.3 |
| + RFP | b4f4 | 110 | 133917 | 8765 | 1222.3 |
| + FFP | b4f4 | 110 | 109557 | 8495 | 1064.7 |
| + LMR | b4f4 | 110 | 35192 | 5610 | 964.4 |
| Standard (DFS Reference) | b4f4 | 110 | 2827 | 67 | 654.7 |


Benchmark Complete.
