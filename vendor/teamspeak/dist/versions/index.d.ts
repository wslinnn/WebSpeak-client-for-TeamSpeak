/**
 * Client versions that TeamSpeak servers accept.
 *
 * A `ClientVersion` is the platform, version string and signature that an
 * official TeamSpeak client sent in its `clientinit`. Each export below is one
 * such version, with the signature it was sent with. Pass one as the client's
 * `version` option to connect as that version:
 *
 * ```ts
 * import { Client } from "@honeybbq/teamspeak/client";
 * import { Windows_3_6_2_1695203293 } from "@honeybbq/teamspeak/versions";
 *
 * new Client(identity, "ts.example.com", "Bot", { version: Windows_3_6_2_1695203293 });
 * ```
 *
 * Signatures cannot be made, only reused, so a version that is not listed here
 * cannot be sent. A server refuses a build below its configured minimum.
 *
 * @module @honeybbq/teamspeak/versions
 */
import type { ClientVersion } from "@honeybbq/teamspeak";
/** Windows 3.0.11, build 1374563791. */
export declare const Windows_3_0_11_1374563791: ClientVersion;
/** Windows 3.0.11, build 1374830986. */
export declare const Windows_3_0_11_1374830986: ClientVersion;
/** Windows 3.0.11, build 1375083581. */
export declare const Windows_3_0_11_1375083581: ClientVersion;
/** Windows 3.0.11.1, build 1375367141. */
export declare const Windows_3_0_11_1_1375367141: ClientVersion;
/** Windows 3.0.11.1, build 1375773286. */
export declare const Windows_3_0_11_1_1375773286: ClientVersion;
/** Linux 3.0.11.1, build 1375773286. */
export declare const Linux_3_0_11_1_1375773286: ClientVersion;
/** OS X 3.0.11.1, build 1375773286. */
export declare const OSX_3_0_11_1_1375773286: ClientVersion;
/** Windows 3.0.12, build 1378199876. */
export declare const Windows_3_0_12_1378199876: ClientVersion;
/** Windows 3.0.12, build 1378301061. */
export declare const Windows_3_0_12_1378301061: ClientVersion;
/** Windows 3.0.12, build 1378461722. */
export declare const Windows_3_0_12_1378461722: ClientVersion;
/** Windows 3.0.12, build 1378715177. */
export declare const Windows_3_0_12_1378715177: ClientVersion;
/** Windows 3.0.13, build 1380008864. */
export declare const Windows_3_0_13_1380008864: ClientVersion;
/** Windows 3.0.13, build 1380283653. */
export declare const Windows_3_0_13_1380283653: ClientVersion;
/** Android 3.0.13, build 1380616389. */
export declare const Android_3_0_13_1380616389: ClientVersion;
/** Windows 3.0.13.1, build 1382530211. */
export declare const Windows_3_0_13_1_1382530211: ClientVersion;
/** OS X 3.0.13.1, build 1382530211. */
export declare const OSX_3_0_13_1_1382530211: ClientVersion;
/** Windows 3.0.14, build 1387444094. */
export declare const Windows_3_0_14_1387444094: ClientVersion;
/** Windows 3.0.14, build 1392643117. */
export declare const Windows_3_0_14_1392643117: ClientVersion;
/** Windows 3.0.14, build 1393597517. */
export declare const Windows_3_0_14_1393597517: ClientVersion;
/** Windows 3.0.14, build 1394114560. */
export declare const Windows_3_0_14_1394114560: ClientVersion;
/** Windows 3.0.14, build 1394624943. */
export declare const Windows_3_0_14_1394624943: ClientVersion;
/** Windows 3.0.15, build 1401808190. */
export declare const Windows_3_0_15_1401808190: ClientVersion;
/** Windows 3.0.15, build 1402646489. */
export declare const Windows_3_0_15_1402646489: ClientVersion;
/** Windows 3.0.15, build 1403250090. */
export declare const Windows_3_0_15_1403250090: ClientVersion;
/** Windows 3.0.15.1, build 1405341092. */
export declare const Windows_3_0_15_1_1405341092: ClientVersion;
/** Windows 3.0.16, build 1406898538. */
export declare const Windows_3_0_16_1406898538: ClientVersion;
/** Windows 3.0.16, build 1407159763. */
export declare const Windows_3_0_16_1407159763: ClientVersion;
/** Linux 3.0.16, build 1407159763. */
export declare const Linux_3_0_16_1407159763: ClientVersion;
/** OS X 3.0.16, build 1407159763. */
export declare const OSX_3_0_16_1407159763: ClientVersion;
/** Android 3.0.19, build 1435141265. */
export declare const Android_3_0_19_1435141265: ClientVersion;
/** Windows 3.0.17, build 1437491062. */
export declare const Windows_3_0_17_1437491062: ClientVersion;
/** Windows 3.0.17, build 1437730067. */
export declare const Windows_3_0_17_1437730067: ClientVersion;
/** Windows 3.0.17, build 1438160323. */
export declare const Windows_3_0_17_1438160323: ClientVersion;
/** Windows 3.0.17, build 1438246387. */
export declare const Windows_3_0_17_1438246387: ClientVersion;
/** Windows 3.0.17, build 1438673913. */
export declare const Windows_3_0_17_1438673913: ClientVersion;
/** Windows 3.0.18, build 1441371697. */
export declare const Windows_3_0_18_1441371697: ClientVersion;
/** Windows 3.0.18, build 1442498553. */
export declare const Windows_3_0_18_1442498553: ClientVersion;
/** Windows 3.0.18, build 1442913547. */
export declare const Windows_3_0_18_1442913547: ClientVersion;
/** Windows 3.0.18, build 1442998335. */
export declare const Windows_3_0_18_1442998335: ClientVersion;
/** Windows 3.0.18.1, build 1444491275. */
export declare const Windows_3_0_18_1_1444491275: ClientVersion;
/** Windows 3.0.19, build 1445263695. */
export declare const Windows_3_0_19_1445263695: ClientVersion;
/** Windows 3.0.18.2, build 1445512488. */
export declare const Windows_3_0_18_2_1445512488: ClientVersion;
/** Linux 3.0.18.2, build 1445512488. */
export declare const Linux_3_0_18_2_1445512488: ClientVersion;
/** OS X 3.0.18.2, build 1445512488. */
export declare const OSX_3_0_18_2_1445512488: ClientVersion;
/** iOS 3.0.18.2, build 1445516611. */
export declare const iOS_3_0_18_2_1445516611: ClientVersion;
/** Android 3.0.20.2, build 1445517273. */
export declare const Android_3_0_20_2_1445517273: ClientVersion;
/** Android 3.0.21, build 1449476724. */
export declare const Android_3_0_21_1449476724: ClientVersion;
/** Windows 3.0.19, build 1455611032. */
export declare const Windows_3_0_19_1455611032: ClientVersion;
/** Windows 3.0.19, build 1457598290. */
export declare const Windows_3_0_19_1457598290: ClientVersion;
/** Windows 3.0.19, build 1459504131. */
export declare const Windows_3_0_19_1459504131: ClientVersion;
/** Linux 3.0.19, build 1459504131. */
export declare const Linux_3_0_19_1459504131: ClientVersion;
/** Windows 3.0.19.1, build 1461588969. */
export declare const Windows_3_0_19_1_1461588969: ClientVersion;
/** OS X 3.0.19.1, build 1461588969. */
export declare const OSX_3_0_19_1_1461588969: ClientVersion;
/** Android 3.0.23, build 1463662487. */
export declare const Android_3_0_23_1463662487: ClientVersion;
/** Windows 3.0.20, build 1465542546. */
export declare const Windows_3_0_20_1465542546: ClientVersion;
/** Windows 3.0.19.2, build 1466597785. */
export declare const Windows_3_0_19_2_1466597785: ClientVersion;
/** Windows 3.0.19.3, build 1466672534. */
export declare const Windows_3_0_19_3_1466672534: ClientVersion;
/** Windows 3.0.19.4, build 1468491418. */
export declare const Windows_3_0_19_4_1468491418: ClientVersion;
/** Linux 3.0.19.4, build 1468491418. */
export declare const Linux_3_0_19_4_1468491418: ClientVersion;
/** OS X 3.0.19.4, build 1468491418. */
export declare const OSX_3_0_19_4_1468491418: ClientVersion;
/** Windows 3.1, build 1471417187. */
export declare const Windows_3_1_1471417187: ClientVersion;
/** Windows 3.1, build 1472203002. */
export declare const Windows_3_1_1472203002: ClientVersion;
/** Windows 3.1, build 1475158080. */
export declare const Windows_3_1_1475158080: ClientVersion;
/** Linux 3.1, build 1475158080. */
export declare const Linux_3_1_1475158080: ClientVersion;
/** Windows 3.1, build 1476372595. */
export declare const Windows_3_1_1476372595: ClientVersion;
/** Linux 3.1, build 1476372595. */
export declare const Linux_3_1_1476372595: ClientVersion;
/** Windows 3.1, build 1476720122. */
export declare const Windows_3_1_1476720122: ClientVersion;
/** Linux 3.1, build 1476720122. */
export declare const Linux_3_1_1476720122: ClientVersion;
/** Windows 3.1, build 1478701553. */
export declare const Windows_3_1_1478701553: ClientVersion;
/** Linux 3.1, build 1478701553. */
export declare const Linux_3_1_1478701553: ClientVersion;
/** Windows 3.1, build 1480583762. */
export declare const Windows_3_1_1480583762: ClientVersion;
/** Linux 3.1, build 1480583762. */
export declare const Linux_3_1_1480583762: ClientVersion;
/** iOS 3.1, build 1481641346. */
export declare const iOS_3_1_1481641346: ClientVersion;
/** Windows 3.1, build 1481795005. */
export declare const Windows_3_1_1481795005: ClientVersion;
/** Linux 3.1, build 1481795005. */
export declare const Linux_3_1_1481795005: ClientVersion;
/** Android 3.1.0, build 1481889010. */
export declare const Android_3_1_0_1481889010: ClientVersion;
/** Windows 3.1.0.1, build 1484223040. */
export declare const Windows_3_1_0_1_1484223040: ClientVersion;
/** Linux 3.1.0.1, build 1484223040. */
export declare const Linux_3_1_0_1_1484223040: ClientVersion;
/** Windows 3.1.1, build 1486051051. */
export declare const Windows_3_1_1_1486051051: ClientVersion;
/** Linux 3.1.1, build 1486051051. */
export declare const Linux_3_1_1_1486051051: ClientVersion;
/** Windows 3.1.1, build 1486485240. */
export declare const Windows_3_1_1_1486485240: ClientVersion;
/** Linux 3.1.1, build 1486485240. */
export declare const Linux_3_1_1_1486485240: ClientVersion;
/** Windows 3.1.1, build 1486712038. */
export declare const Windows_3_1_1_1486712038: ClientVersion;
/** Linux 3.1.1, build 1486712038. */
export declare const Linux_3_1_1_1486712038: ClientVersion;
/** Windows 3.1.1.1, build 1487668590. */
export declare const Windows_3_1_1_1_1487668590: ClientVersion;
/** Linux 3.1.1.1, build 1487668590. */
export declare const Linux_3_1_1_1_1487668590: ClientVersion;
/** OS X 3.1.1.1, build 1487668590. */
export declare const OSX_3_1_1_1_1487668590: ClientVersion;
/** Android 3.1.0.2, build 1487778817. */
export declare const Android_3_1_0_2_1487778817: ClientVersion;
/** Windows 3.1.2, build 1489662774. */
export declare const Windows_3_1_2_1489662774: ClientVersion;
/** Linux 3.1.2, build 1489662774. */
export declare const Linux_3_1_2_1489662774: ClientVersion;
/** OS X 3.1.2, build 1489662774. */
export declare const OSX_3_1_2_1489662774: ClientVersion;
/** Windows 3.1.3, build 1490279472. */
export declare const Windows_3_1_3_1490279472: ClientVersion;
/** Linux 3.1.3, build 1490279472. */
export declare const Linux_3_1_3_1490279472: ClientVersion;
/** Android 3.1.2, build 1490288199. */
export declare const Android_3_1_2_1490288199: ClientVersion;
/** iOS 3.1.2, build 1490291439. */
export declare const iOS_3_1_2_1490291439: ClientVersion;
/** Windows 3.1.4, build 1491993378. */
export declare const Windows_3_1_4_1491993378: ClientVersion;
/** Linux 3.1.4, build 1491993378. */
export declare const Linux_3_1_4_1491993378: ClientVersion;
/** OS X 3.1.4, build 1491993378. */
export declare const OSX_3_1_4_1491993378: ClientVersion;
/** Android 3.1.3.1, build 1493128735. */
export declare const Android_3_1_3_1_1493128735: ClientVersion;
/** Windows 3.1.5, build 1496989945. */
export declare const Windows_3_1_5_1496989945: ClientVersion;
/** Linux 3.1.5, build 1496989945. */
export declare const Linux_3_1_5_1496989945: ClientVersion;
/** Windows 3.1.5, build 1497432760. */
export declare const Windows_3_1_5_1497432760: ClientVersion;
/** Linux 3.1.5, build 1497432760. */
export declare const Linux_3_1_5_1497432760: ClientVersion;
/** Windows 3.1.4.2, build 1498644101. */
export declare const Windows_3_1_4_2_1498644101: ClientVersion;
/** Linux 3.1.4.2, build 1498644101. */
export declare const Linux_3_1_4_2_1498644101: ClientVersion;
/** OS X 3.1.4.2, build 1498644101. */
export declare const OSX_3_1_4_2_1498644101: ClientVersion;
/** Windows 3.1.5, build 1498740787. */
export declare const Windows_3_1_5_1498740787: ClientVersion;
/** Linux 3.1.5, build 1498740787. */
export declare const Linux_3_1_5_1498740787: ClientVersion;
/** Windows 3.1.5, build 1499699899. */
export declare const Windows_3_1_5_1499699899: ClientVersion;
/** Linux 3.1.5, build 1499699899. */
export declare const Linux_3_1_5_1499699899: ClientVersion;
/** Windows 3.1.5, build 1500360741. */
export declare const Windows_3_1_5_1500360741: ClientVersion;
/** Linux 3.1.5, build 1500360741. */
export declare const Linux_3_1_5_1500360741: ClientVersion;
/** Windows 3.1.5, build 1500537355. */
export declare const Windows_3_1_5_1500537355: ClientVersion;
/** Linux 3.1.5, build 1500537355. */
export declare const Linux_3_1_5_1500537355: ClientVersion;
/** OS X 3.1.5, build 1500537355. */
export declare const OSX_3_1_5_1500537355: ClientVersion;
/** Windows 3.1.6, build 1502264952. */
export declare const Windows_3_1_6_1502264952: ClientVersion;
/** Linux 3.1.6, build 1502264952. */
export declare const Linux_3_1_6_1502264952: ClientVersion;
/** Android 3.1.6, build 1502275280. */
export declare const Android_3_1_6_1502275280: ClientVersion;
/** Windows 3.1.6, build 1502873983. */
export declare const Windows_3_1_6_1502873983: ClientVersion;
/** Linux 3.1.6, build 1502873983. */
export declare const Linux_3_1_6_1502873983: ClientVersion;
/** OS X 3.1.6, build 1502873983. */
export declare const OSX_3_1_6_1502873983: ClientVersion;
/** iOS 3.1.6, build 1502881949. */
export declare const iOS_3_1_6_1502881949: ClientVersion;
/** Windows 3.1.7, build 1507896705. */
export declare const Windows_3_1_7_1507896705: ClientVersion;
/** OS X 3.1.7, build 1507896705. */
export declare const OSX_3_1_7_1507896705: ClientVersion;
/** OS X 3.1.7, build 1510583507. */
export declare const OSX_3_1_7_1510583507: ClientVersion;
/** OS X 3.1.7, build 1512049856. */
export declare const OSX_3_1_7_1512049856: ClientVersion;
/** OS X 3.1.7, build 1512141423. */
export declare const OSX_3_1_7_1512141423: ClientVersion;
/** Windows 3.1.7, build 1512391926. */
export declare const Windows_3_1_7_1512391926: ClientVersion;
/** Android 3.1.7, build 1512665843. */
export declare const Android_3_1_7_1512665843: ClientVersion;
/** Windows 3.1.7, build 1513163251. */
export declare const Windows_3_1_7_1513163251: ClientVersion;
/** Linux 3.1.7, build 1513163251. */
export declare const Linux_3_1_7_1513163251: ClientVersion;
/** OS X 3.1.7, build 1513163251. */
export declare const OSX_3_1_7_1513163251: ClientVersion;
/** Windows 3.1.8, build 1516099541. */
export declare const Windows_3_1_8_1516099541: ClientVersion;
/** Windows 3.1.8, build 1516349129. */
export declare const Windows_3_1_8_1516349129: ClientVersion;
/** Linux 3.1.8, build 1516349129. */
export declare const Linux_3_1_8_1516349129: ClientVersion;
/** OS X 3.1.8, build 1516349129. */
export declare const OSX_3_1_8_1516349129: ClientVersion;
/** Windows 3.1.8, build 1516614607. */
export declare const Windows_3_1_8_1516614607: ClientVersion;
/** Linux 3.1.8, build 1516614607. */
export declare const Linux_3_1_8_1516614607: ClientVersion;
/** OS X 3.1.8, build 1516614607. */
export declare const OSX_3_1_8_1516614607: ClientVersion;
/** Android 3.1.8, build 1516718352. */
export declare const Android_3_1_8_1516718352: ClientVersion;
/** Android 3.1.8, build 1516865456. */
export declare const Android_3_1_8_1516865456: ClientVersion;
/** iOS 3.1.8, build 1516887927. */
export declare const iOS_3_1_8_1516887927: ClientVersion;
/** OS X 3.1.9, build 1520246719. */
export declare const OSX_3_1_9_1520246719: ClientVersion;
/** OS X 3.1.9, build 1520591856. */
export declare const OSX_3_1_9_1520591856: ClientVersion;
/** OS X 3.1.9, build 1521637641. */
export declare const OSX_3_1_9_1521637641: ClientVersion;
/** OS X 3.1.9, build 1523609596. */
export declare const OSX_3_1_9_1523609596: ClientVersion;
/** Windows 3.1.9, build 1525442084. */
export declare const Windows_3_1_9_1525442084: ClientVersion;
/** Linux 3.1.9, build 1525442084. */
export declare const Linux_3_1_9_1525442084: ClientVersion;
/** OS X 3.1.9, build 1525442084. */
export declare const OSX_3_1_9_1525442084: ClientVersion;
/** Windows 3.1.10, build 1528537615. */
export declare const Windows_3_1_10_1528537615: ClientVersion;
/** Linux 3.1.10, build 1528537615. */
export declare const Linux_3_1_10_1528537615: ClientVersion;
/** OS X 3.1.10, build 1528537615. */
export declare const OSX_3_1_10_1528537615: ClientVersion;
/** Windows 3.2.0, build 1530183207. */
export declare const Windows_3_2_0_1530183207: ClientVersion;
/** Windows 3.2.0, build 1530280071. */
export declare const Windows_3_2_0_1530280071: ClientVersion;
/** Windows 3.2.0, build 1530790120. */
export declare const Windows_3_2_0_1530790120: ClientVersion;
/** Android 3.2.0, build 1530859847. */
export declare const Android_3_2_0_1530859847: ClientVersion;
/** Windows 3.2.0, build 1531390529. */
export declare const Windows_3_2_0_1531390529: ClientVersion;
/** Windows 3.2.0, build 1531481279. */
export declare const Windows_3_2_0_1531481279: ClientVersion;
/** OS X 3.2.0, build 1531481279. */
export declare const OSX_3_2_0_1531481279: ClientVersion;
/** Windows 3.2.0, build 1532529142. */
export declare const Windows_3_2_0_1532529142: ClientVersion;
/** Windows 3.2.0, build 1533289185. */
export declare const Windows_3_2_0_1533289185: ClientVersion;
/** Windows 3.2.0, build 1533739581. */
export declare const Windows_3_2_0_1533739581: ClientVersion;
/** Linux 3.2.0, build 1533739581. */
export declare const Linux_3_2_0_1533739581: ClientVersion;
/** OS X 3.2.0, build 1533739581. */
export declare const OSX_3_2_0_1533739581: ClientVersion;
/** Windows 3.2.1, build 1534255236. */
export declare const Windows_3_2_1_1534255236: ClientVersion;
/** Linux 3.2.1, build 1534255236. */
export declare const Linux_3_2_1_1534255236: ClientVersion;
/** OS X 3.2.1, build 1534255236. */
export declare const OSX_3_2_1_1534255236: ClientVersion;
/** Android 3.2.0, build 1534407950. */
export declare const Android_3_2_0_1534407950: ClientVersion;
/** iOS 3.2.0, build 1534410132. */
export declare const iOS_3_2_0_1534410132: ClientVersion;
/** Android 3.2.1, build 1535010120. */
export declare const Android_3_2_1_1535010120: ClientVersion;
/** Windows 3.2.2, build 1535010838. */
export declare const Windows_3_2_2_1535010838: ClientVersion;
/** Linux 3.2.2, build 1535010838. */
export declare const Linux_3_2_2_1535010838: ClientVersion;
/** OS X 3.2.2, build 1535010838. */
export declare const OSX_3_2_2_1535010838: ClientVersion;
/** Windows 3.2.2, build 1535459906. */
export declare const Windows_3_2_2_1535459906: ClientVersion;
/** OS X 3.2.2, build 1535459906. */
export declare const OSX_3_2_2_1535459906: ClientVersion;
/** Android 3.2.2, build 1536327256. */
export declare const Android_3_2_2_1536327256: ClientVersion;
/** Windows 3.2.2, build 1536584091. */
export declare const Windows_3_2_2_1536584091: ClientVersion;
/** iOS 3.2.2, build 1536587534. */
export declare const iOS_3_2_2_1536587534: ClientVersion;
/** Windows 3.2.2, build 1536915823. */
export declare const Windows_3_2_2_1536915823: ClientVersion;
/** Windows 3.2.2, build 1537178465. */
export declare const Windows_3_2_2_1537178465: ClientVersion;
/** Linux 3.2.2, build 1537178465. */
export declare const Linux_3_2_2_1537178465: ClientVersion;
/** OS X 3.2.2, build 1537178465. */
export declare const OSX_3_2_2_1537178465: ClientVersion;
/** Android 3.2.3, build 1537790492. */
export declare const Android_3_2_3_1537790492: ClientVersion;
/** Android 3.2.4, build 1537790492. */
export declare const Android_3_2_4_1537790492: ClientVersion;
/** Windows 3.2.3, build 1538467030. */
export declare const Windows_3_2_3_1538467030: ClientVersion;
/** Linux 3.2.3, build 1538467030. */
export declare const Linux_3_2_3_1538467030: ClientVersion;
/** OS X 3.2.3, build 1538467030. */
export declare const OSX_3_2_3_1538467030: ClientVersion;
/** iOS 3.2.3, build 1538494750. */
export declare const iOS_3_2_3_1538494750: ClientVersion;
/** Windows 0.0.1, build 1543011433. */
export declare const Windows_0_0_1_1543011433: ClientVersion;
/** Windows 0.0.1, build 1543414034. */
export declare const Windows_0_0_1_1543414034: ClientVersion;
/** Windows 0.0.1, build 1549019113. */
export declare const Windows_0_0_1_1549019113: ClientVersion;
/** Linux 0.0.1, build 1549639384. */
export declare const Linux_0_0_1_1549639384: ClientVersion;
/** OS X 0.0.1, build 1549657968. */
export declare const OSX_0_0_1_1549657968: ClientVersion;
/** Windows 0.0.1, build 1549713549. */
export declare const Windows_0_0_1_1549713549: ClientVersion;
/** Linux 0.0.1, build 1549713549. */
export declare const Linux_0_0_1_1549713549: ClientVersion;
/** OS X 0.0.1, build 1549713549. */
export declare const OSX_0_0_1_1549713549: ClientVersion;
/** Windows 0.0.1, build 1549829683. */
export declare const Windows_0_0_1_1549829683: ClientVersion;
/** OS X 0.0.1, build 1549829683. */
export declare const OSX_0_0_1_1549829683: ClientVersion;
/** OS X 0.0.1, build 1549895652. */
export declare const OSX_0_0_1_1549895652: ClientVersion;
/** Windows 0.0.1, build 1549957568. */
export declare const Windows_0_0_1_1549957568: ClientVersion;
/** OS X 0.0.1, build 1550066976. */
export declare const OSX_0_0_1_1550066976: ClientVersion;
/** OS X 0.0.1, build 1550084944. */
export declare const OSX_0_0_1_1550084944: ClientVersion;
/** OS X 0.0.1, build 1550143598. */
export declare const OSX_0_0_1_1550143598: ClientVersion;
/** Windows 0.0.1, build 1550226976. */
export declare const Windows_0_0_1_1550226976: ClientVersion;
/** Linux 0.0.1, build 1550226976. */
export declare const Linux_0_0_1_1550226976: ClientVersion;
/** OS X 0.0.1, build 1550226976. */
export declare const OSX_0_0_1_1550226976: ClientVersion;
/** Windows 0.0.1, build 1550255704. */
export declare const Windows_0_0_1_1550255704: ClientVersion;
/** OS X 0.0.1, build 1550255704. */
export declare const OSX_0_0_1_1550255704: ClientVersion;
/** OS X 0.0.1, build 1550502842. */
export declare const OSX_0_0_1_1550502842: ClientVersion;
/** OS X 0.0.1, build 1550679784. */
export declare const OSX_0_0_1_1550679784: ClientVersion;
/** OS X 0.0.1, build 1550876871. */
export declare const OSX_0_0_1_1550876871: ClientVersion;
/** OS X 0.0.1, build 1551044658. */
export declare const OSX_0_0_1_1551044658: ClientVersion;
/** Windows 0.0.1, build 1551204931. */
export declare const Windows_0_0_1_1551204931: ClientVersion;
/** OS X 0.0.1, build 1551459948. */
export declare const OSX_0_0_1_1551459948: ClientVersion;
/** Windows 0.0.1, build 1551711227. */
export declare const Windows_0_0_1_1551711227: ClientVersion;
/** OS X 0.0.1, build 1551713318. */
export declare const OSX_0_0_1_1551713318: ClientVersion;
/** Windows 0.0.1, build 1551783896. */
export declare const Windows_0_0_1_1551783896: ClientVersion;
/** Windows 0.0.1, build 1552322960. */
export declare const Windows_0_0_1_1552322960: ClientVersion;
/** OS X 0.0.1, build 1552322960. */
export declare const OSX_0_0_1_1552322960: ClientVersion;
/** OS X 0.0.1, build 1552499895. */
export declare const OSX_0_0_1_1552499895: ClientVersion;
/** Windows 0.0.1, build 1552572862. */
export declare const Windows_0_0_1_1552572862: ClientVersion;
/** OS X 0.0.1, build 1552572862. */
export declare const OSX_0_0_1_1552572862: ClientVersion;
/** OS X 0.0.1, build 1552575092. */
export declare const OSX_0_0_1_1552575092: ClientVersion;
/** Windows 0.0.1, build 1552639727. */
export declare const Windows_0_0_1_1552639727: ClientVersion;
/** OS X 0.0.1, build 1552639727. */
export declare const OSX_0_0_1_1552639727: ClientVersion;
/** OS X 0.0.1, build 1552661204. */
export declare const OSX_0_0_1_1552661204: ClientVersion;
/** Windows 0.0.1, build 1552982242. */
export declare const Windows_0_0_1_1552982242: ClientVersion;
/** OS X 0.0.1, build 1553161313. */
export declare const OSX_0_0_1_1553161313: ClientVersion;
/** Windows 0.0.1, build 1553512400. */
export declare const Windows_0_0_1_1553512400: ClientVersion;
/** OS X 0.0.1, build 1553512400. */
export declare const OSX_0_0_1_1553512400: ClientVersion;
/** OS X 0.0.1, build 1553695906. */
export declare const OSX_0_0_1_1553695906: ClientVersion;
/** OS X 0.0.1, build 1554384958. */
export declare const OSX_0_0_1_1554384958: ClientVersion;
/** OS X 0.0.1, build 1554399512. */
export declare const OSX_0_0_1_1554399512: ClientVersion;
/** Windows 0.0.1, build 1554736383. */
export declare const Windows_0_0_1_1554736383: ClientVersion;
/** Windows 0.0.1, build 1554822978. */
export declare const Windows_0_0_1_1554822978: ClientVersion;
/** OS X 0.0.1, build 1554822978. */
export declare const OSX_0_0_1_1554822978: ClientVersion;
/** Windows 0.0.1, build 1554918032. */
export declare const Windows_0_0_1_1554918032: ClientVersion;
/** Android 3.2.5, build 1554991343. */
export declare const Android_3_2_5_1554991343: ClientVersion;
/** Windows 0.0.1, build 1555000573. */
export declare const Windows_0_0_1_1555000573: ClientVersion;
/** Windows 0.0.1, build 1555015683. */
export declare const Windows_0_0_1_1555015683: ClientVersion;
/** OS X 0.0.1, build 1555082010. */
export declare const OSX_0_0_1_1555082010: ClientVersion;
/** macOS 5.0.0-355a06f9, build 1555407897. */
export declare const macOS_5_0_0_355a06f9_1555407897: ClientVersion;
/** Windows 5.0.0-test-192, build 1555445179. */
export declare const Windows_5_0_0_test_192_1555445179: ClientVersion;
/** macOS 5.0.0-test-192, build 1555445179. */
export declare const macOS_5_0_0_test_192_1555445179: ClientVersion;
/** macOS 5.0.0-bf7671e7, build 1555448654. */
export declare const macOS_5_0_0_bf7671e7_1555448654: ClientVersion;
/** Windows 5.0.0-test-197, build 1555495120. */
export declare const Windows_5_0_0_test_197_1555495120: ClientVersion;
/** macOS 5.0.0-718a441b, build 1555496184. */
export declare const macOS_5_0_0_718a441b_1555496184: ClientVersion;
/** Windows 3.2.5, build 1555517253. */
export declare const Windows_3_2_5_1555517253: ClientVersion;
/** Linux 3.2.5, build 1555517253. */
export declare const Linux_3_2_5_1555517253: ClientVersion;
/** OS X 3.2.5, build 1555517253. */
export declare const OSX_3_2_5_1555517253: ClientVersion;
/** macOS 5.0.0-59fc92f9, build 1555588817. */
export declare const macOS_5_0_0_59fc92f9_1555588817: ClientVersion;
/** Windows 3.3.0, build 1555590310. */
export declare const Windows_3_3_0_1555590310: ClientVersion;
/** OS X 3.3.0, build 1555590310. */
export declare const OSX_3_3_0_1555590310: ClientVersion;
/** macOS 5.0.0-ffa1a6e8, build 1555609180. */
export declare const macOS_5_0_0_ffa1a6e8_1555609180: ClientVersion;
/** macOS 5.0.0-01c1042e, build 1555956706. */
export declare const macOS_5_0_0_01c1042e_1555956706: ClientVersion;
/** Windows 3.3.0, build 1556009531. */
export declare const Windows_3_3_0_1556009531: ClientVersion;
/** Windows 3.3.0, build 1556116957. */
export declare const Windows_3_3_0_1556116957: ClientVersion;
/** macOS 5.0.0-20262827, build 1556210877. */
export declare const macOS_5_0_0_20262827_1556210877: ClientVersion;
/** Windows 5.0.0-test-202, build 1556234251. */
export declare const Windows_5_0_0_test_202_1556234251: ClientVersion;
/** OS X 3.3.0, build 1556290731. */
export declare const OSX_3_3_0_1556290731: ClientVersion;
/** macOS 5.0.0-alpha203, build 1556295552. */
export declare const macOS_5_0_0_alpha203_1556295552: ClientVersion;
/** Windows 5.0.0-alpha204, build 1556312473. */
export declare const Windows_5_0_0_alpha204_1556312473: ClientVersion;
/** macOS 5.0.0-alpha204, build 1556312473. */
export declare const macOS_5_0_0_alpha204_1556312473: ClientVersion;
/** Windows 5.0.0-alpha206, build 1556530824. */
export declare const Windows_5_0_0_alpha206_1556530824: ClientVersion;
/** Linux 5.0.0-alpha206, build 1556530824. */
export declare const Linux_5_0_0_alpha206_1556530824: ClientVersion;
/** macOS 5.0.0-alpha206, build 1556530824. */
export declare const macOS_5_0_0_alpha206_1556530824: ClientVersion;
/** Windows 3.3.0, build 1556542489. */
export declare const Windows_3_3_0_1556542489: ClientVersion;
/** OS X 3.3.0, build 1556542489. */
export declare const OSX_3_3_0_1556542489: ClientVersion;
/** Windows 5.0.0-alpha207, build 1556616734. */
export declare const Windows_5_0_0_alpha207_1556616734: ClientVersion;
/** macOS 5.0.0-alpha207, build 1556616734. */
export declare const macOS_5_0_0_alpha207_1556616734: ClientVersion;
/** Windows 3.3.0, build 1556630414. */
export declare const Windows_3_3_0_1556630414: ClientVersion;
/** OS X 3.3.0, build 1556630414. */
export declare const OSX_3_3_0_1556630414: ClientVersion;
/** Windows 5.0.0-alpha208, build 1556660248. */
export declare const Windows_5_0_0_alpha208_1556660248: ClientVersion;
/** Windows 5.0.0-alpha209, build 1556801404. */
export declare const Windows_5_0_0_alpha209_1556801404: ClientVersion;
/** Windows 5.0.0-alpha212, build 1556813029. */
export declare const Windows_5_0_0_alpha212_1556813029: ClientVersion;
/** macOS 5.0.0-alpha212, build 1556813029. */
export declare const macOS_5_0_0_alpha212_1556813029: ClientVersion;
/** Windows 5.0.0-alpha214, build 1556897845. */
export declare const Windows_5_0_0_alpha214_1556897845: ClientVersion;
/** macOS 5.0.0-alpha214, build 1556897845. */
export declare const macOS_5_0_0_alpha214_1556897845: ClientVersion;
/** Windows 5.0.0-alpha216, build 1556918526. */
export declare const Windows_5_0_0_alpha216_1556918526: ClientVersion;
/** macOS 5.0.0-alpha216, build 1556918526. */
export declare const macOS_5_0_0_alpha216_1556918526: ClientVersion;
/** Windows 5.0.0-alpha217, build 1557239244. */
export declare const Windows_5_0_0_alpha217_1557239244: ClientVersion;
/** Windows 5.0.0-alpha218, build 1557333442. */
export declare const Windows_5_0_0_alpha218_1557333442: ClientVersion;
/** Windows 5.0.0-alpha219, build 1557415390. */
export declare const Windows_5_0_0_alpha219_1557415390: ClientVersion;
/** macOS 5.0.0-alpha219, build 1557415390. */
export declare const macOS_5_0_0_alpha219_1557415390: ClientVersion;
/** Windows 5.0.0-alpha220, build 1557519031. */
export declare const Windows_5_0_0_alpha220_1557519031: ClientVersion;
/** macOS 5.0.0-alpha220, build 1557519031. */
export declare const macOS_5_0_0_alpha220_1557519031: ClientVersion;
/** Windows 5.0.0-alpha222, build 1557769659. */
export declare const Windows_5_0_0_alpha222_1557769659: ClientVersion;
/** macOS 5.0.0-alpha222, build 1557769659. */
export declare const macOS_5_0_0_alpha222_1557769659: ClientVersion;
/** Windows 5.0.0-alpha223, build 1557842114. */
export declare const Windows_5_0_0_alpha223_1557842114: ClientVersion;
/** macOS 5.0.0-alpha223, build 1557842114. */
export declare const macOS_5_0_0_alpha223_1557842114: ClientVersion;
/** Windows 3.3.0, build 1557914437. */
export declare const Windows_3_3_0_1557914437: ClientVersion;
/** OS X 3.3.0, build 1557914437. */
export declare const OSX_3_3_0_1557914437: ClientVersion;
/** macOS 5.0.0-alpha224, build 1558094517. */
export declare const macOS_5_0_0_alpha224_1558094517: ClientVersion;
/** Windows 5.0.0-alpha225, build 1558176095. */
export declare const Windows_5_0_0_alpha225_1558176095: ClientVersion;
/** macOS 5.0.0-alpha226, build 1558186695. */
export declare const macOS_5_0_0_alpha226_1558186695: ClientVersion;
/** Windows 5.0.0-alpha228, build 1558453482. */
export declare const Windows_5_0_0_alpha228_1558453482: ClientVersion;
/** macOS 5.0.0-alpha228, build 1558453482. */
export declare const macOS_5_0_0_alpha228_1558453482: ClientVersion;
/** Windows 5.0.0-alpha229, build 1558545291. */
export declare const Windows_5_0_0_alpha229_1558545291: ClientVersion;
/** macOS 5.0.0-alpha229, build 1558545291. */
export declare const macOS_5_0_0_alpha229_1558545291: ClientVersion;
/** Windows 5.0.0-alpha230, build 1558630781. */
export declare const Windows_5_0_0_alpha230_1558630781: ClientVersion;
/** macOS 5.0.0-alpha230, build 1558630781. */
export declare const macOS_5_0_0_alpha230_1558630781: ClientVersion;
/** macOS 5.0.0-07b4003d, build 1558632796. */
export declare const macOS_5_0_0_07b4003d_1558632796: ClientVersion;
/** Linux 5.0.0-alpha231, build 1558722704. */
export declare const Linux_5_0_0_alpha231_1558722704: ClientVersion;
/** macOS 5.0.0-alpha231, build 1558722704. */
export declare const macOS_5_0_0_alpha231_1558722704: ClientVersion;
/** Windows 5.0.0-alpha232, build 1558967089. */
export declare const Windows_5_0_0_alpha232_1558967089: ClientVersion;
/** Linux 5.0.0-alpha232, build 1558967089. */
export declare const Linux_5_0_0_alpha232_1558967089: ClientVersion;
/** macOS 5.0.0-alpha232, build 1558967089. */
export declare const macOS_5_0_0_alpha232_1558967089: ClientVersion;
/** Windows 3.3.0, build 1558980407. */
export declare const Windows_3_3_0_1558980407: ClientVersion;
/** OS X 3.3.0, build 1558980407. */
export declare const OSX_3_3_0_1558980407: ClientVersion;
/** Linux 3.3.0, build 1559042453. */
export declare const Linux_3_3_0_1559042453: ClientVersion;
/** OS X 3.3.0, build 1559042453. */
export declare const OSX_3_3_0_1559042453: ClientVersion;
/** OS X 3.3.0, build 1559061820. */
export declare const OSX_3_3_0_1559061820: ClientVersion;
/** OS X 3.3.0, build 1559143149. */
export declare const OSX_3_3_0_1559143149: ClientVersion;
/** iOS 3.3.0, build 1559144369. */
export declare const iOS_3_3_0_1559144369: ClientVersion;
/** Windows 3.3.0, build 1559151651. */
export declare const Windows_3_3_0_1559151651: ClientVersion;
/** OS X 3.3.0, build 1559151651. */
export declare const OSX_3_3_0_1559151651: ClientVersion;
/** OS X 3.3.0, build 1559172971. */
export declare const OSX_3_3_0_1559172971: ClientVersion;
/** Windows 3.3.0, build 1559207969. */
export declare const Windows_3_3_0_1559207969: ClientVersion;
/** Linux 3.3.0, build 1559207969. */
export declare const Linux_3_3_0_1559207969: ClientVersion;
/** OS X 3.3.0, build 1559207969. */
export declare const OSX_3_3_0_1559207969: ClientVersion;
/** Windows 5.0.0-alpha234, build 1559301070. */
export declare const Windows_5_0_0_alpha234_1559301070: ClientVersion;
/** macOS 5.0.0-alpha234, build 1559301070. */
export declare const macOS_5_0_0_alpha234_1559301070: ClientVersion;
/** Windows 3.3.0, build 1559307127. */
export declare const Windows_3_3_0_1559307127: ClientVersion;
/** Linux 3.3.0, build 1559307127. */
export declare const Linux_3_3_0_1559307127: ClientVersion;
/** OS X 3.3.0, build 1559307127. */
export declare const OSX_3_3_0_1559307127: ClientVersion;
/** Windows 3.3.0, build 1559395482. */
export declare const Windows_3_3_0_1559395482: ClientVersion;
/** OS X 3.3.0, build 1559395482. */
export declare const OSX_3_3_0_1559395482: ClientVersion;
/** Windows 3.3.0, build 1559423503. */
export declare const Windows_3_3_0_1559423503: ClientVersion;
/** Linux 3.3.0, build 1559423503. */
export declare const Linux_3_3_0_1559423503: ClientVersion;
/** OS X 3.3.0, build 1559423503. */
export declare const OSX_3_3_0_1559423503: ClientVersion;
/** macOS 5.0.0-alpha235, build 1559482103. */
export declare const macOS_5_0_0_alpha235_1559482103: ClientVersion;
/** Windows 5.0.0-alpha236, build 1559578284. */
export declare const Windows_5_0_0_alpha236_1559578284: ClientVersion;
/** Windows 5.0.0-alpha238, build 1559732615. */
export declare const Windows_5_0_0_alpha238_1559732615: ClientVersion;
/** macOS 5.0.0-alpha238, build 1559732615. */
export declare const macOS_5_0_0_alpha238_1559732615: ClientVersion;
/** OS X 3.3.0, build 1559767425. */
export declare const OSX_3_3_0_1559767425: ClientVersion;
/** Windows 5.0.0-alpha239, build 1559815502. */
export declare const Windows_5_0_0_alpha239_1559815502: ClientVersion;
/** Windows 3.3.0, build 1559832098. */
export declare const Windows_3_3_0_1559832098: ClientVersion;
/** OS X 3.3.0, build 1559832098. */
export declare const OSX_3_3_0_1559832098: ClientVersion;
/** Android 3.3.0, build 1559834030. */
export declare const Android_3_3_0_1559834030: ClientVersion;
/** Windows 5.0.0-alpha241, build 1559838513. */
export declare const Windows_5_0_0_alpha241_1559838513: ClientVersion;
/** macOS 5.0.0-alpha241, build 1559838513. */
export declare const macOS_5_0_0_alpha241_1559838513: ClientVersion;
/** Windows 3.3.0, build 1559847347. */
export declare const Windows_3_3_0_1559847347: ClientVersion;
/** Linux 3.3.0, build 1559847347. */
export declare const Linux_3_3_0_1559847347: ClientVersion;
/** OS X 3.3.0, build 1559847347. */
export declare const OSX_3_3_0_1559847347: ClientVersion;
/** Windows 3.3.0, build 1560032346. */
export declare const Windows_3_3_0_1560032346: ClientVersion;
/** Linux 3.3.0, build 1560032346. */
export declare const Linux_3_3_0_1560032346: ClientVersion;
/** OS X 3.3.0, build 1560032346. */
export declare const OSX_3_3_0_1560032346: ClientVersion;
/** Windows 5.0.0-alpha242, build 1560169692. */
export declare const Windows_5_0_0_alpha242_1560169692: ClientVersion;
/** macOS 5.0.0-alpha242, build 1560169692. */
export declare const macOS_5_0_0_alpha242_1560169692: ClientVersion;
/** Windows 3.3.0, build 1560189475. */
export declare const Windows_3_3_0_1560189475: ClientVersion;
/** OS X 3.3.0, build 1560189475. */
export declare const OSX_3_3_0_1560189475: ClientVersion;
/** Windows 3.3.0, build 1560265364. */
export declare const Windows_3_3_0_1560265364: ClientVersion;
/** OS X 3.3.0, build 1560265364. */
export declare const OSX_3_3_0_1560265364: ClientVersion;
/** Windows 5.0.0-alpha243, build 1560345924. */
export declare const Windows_5_0_0_alpha243_1560345924: ClientVersion;
/** macOS 5.0.0-alpha243, build 1560345924. */
export declare const macOS_5_0_0_alpha243_1560345924: ClientVersion;
/** Windows 3.3.0, build 1560464251. */
export declare const Windows_3_3_0_1560464251: ClientVersion;
/** OS X 3.3.0, build 1560504952. */
export declare const OSX_3_3_0_1560504952: ClientVersion;
/** OS X 3.3.0, build 1560546557. */
export declare const OSX_3_3_0_1560546557: ClientVersion;
/** Windows 3.3.0, build 1560850141. */
export declare const Windows_3_3_0_1560850141: ClientVersion;
/** Linux 3.3.0, build 1560850141. */
export declare const Linux_3_3_0_1560850141: ClientVersion;
/** OS X 3.3.0, build 1560850141. */
export declare const OSX_3_3_0_1560850141: ClientVersion;
/** Windows 5.0.0-alpha247, build 1561047486. */
export declare const Windows_5_0_0_alpha247_1561047486: ClientVersion;
/** macOS 5.0.0-alpha247, build 1561047486. */
export declare const macOS_5_0_0_alpha247_1561047486: ClientVersion;
/** macOS 5.0.0-alpha248, build 1561153809. */
export declare const macOS_5_0_0_alpha248_1561153809: ClientVersion;
/** Windows 3.3.1, build 1561236585. */
export declare const Windows_3_3_1_1561236585: ClientVersion;
/** Linux 3.3.1, build 1561236585. */
export declare const Linux_3_3_1_1561236585: ClientVersion;
/** OS X 3.3.1, build 1561236585. */
export declare const OSX_3_3_1_1561236585: ClientVersion;
/** Windows 5.0.0-alpha249, build 1561367386. */
export declare const Windows_5_0_0_alpha249_1561367386: ClientVersion;
/** macOS 5.0.0-alpha249, build 1561367386. */
export declare const macOS_5_0_0_alpha249_1561367386: ClientVersion;
/** OS X 3.3.1, build 1561495949. */
export declare const OSX_3_3_1_1561495949: ClientVersion;
/** macOS 5.0.0-alpha252, build 1561656532. */
export declare const macOS_5_0_0_alpha252_1561656532: ClientVersion;
/** macOS 5.0.0-alpha253, build 1561732636. */
export declare const macOS_5_0_0_alpha253_1561732636: ClientVersion;
/** Windows 3.3.1, build 1561761890. */
export declare const Windows_3_3_1_1561761890: ClientVersion;
/** OS X 3.3.1, build 1561761890. */
export declare const OSX_3_3_1_1561761890: ClientVersion;
/** Windows 5.0.0-alpha254, build 1561967684. */
export declare const Windows_5_0_0_alpha254_1561967684: ClientVersion;
/** Windows 3.3.1, build 1562186016. */
export declare const Windows_3_3_1_1562186016: ClientVersion;
/** Linux 3.3.1, build 1562186016. */
export declare const Linux_3_3_1_1562186016: ClientVersion;
/** OS X 3.3.1, build 1562186016. */
export declare const OSX_3_3_1_1562186016: ClientVersion;
/** Windows 5.0.0-alpha257, build 1562592572. */
export declare const Windows_5_0_0_alpha257_1562592572: ClientVersion;
/** Windows 5.0.0-alpha258, build 1562611926. */
export declare const Windows_5_0_0_alpha258_1562611926: ClientVersion;
/** Windows 5.0.0-alpha259, build 1562680101. */
export declare const Windows_5_0_0_alpha259_1562680101: ClientVersion;
/** Windows 5.0.0-alpha260, build 1562686022. */
export declare const Windows_5_0_0_alpha260_1562686022: ClientVersion;
/** Windows 5.0.0-alpha261, build 1562743548. */
export declare const Windows_5_0_0_alpha261_1562743548: ClientVersion;
/** Windows 5.0.0-alpha262, build 1562749547. */
export declare const Windows_5_0_0_alpha262_1562749547: ClientVersion;
/** Windows 5.0.0-alpha263, build 1562771414. */
export declare const Windows_5_0_0_alpha263_1562771414: ClientVersion;
/** Windows 5.0.0-alpha264, build 1562775539. */
export declare const Windows_5_0_0_alpha264_1562775539: ClientVersion;
/** Windows 5.0.0-alpha265, build 1562849836. */
export declare const Windows_5_0_0_alpha265_1562849836: ClientVersion;
/** Linux 5.0.0-alpha265, build 1562849836. */
export declare const Linux_5_0_0_alpha265_1562849836: ClientVersion;
/** Windows 5.0.0-alpha266, build 1562943568. */
export declare const Windows_5_0_0_alpha266_1562943568: ClientVersion;
/** OS X 3.3.1, build 1563026407. */
export declare const OSX_3_3_1_1563026407: ClientVersion;
/** OS X 3.3.1, build 1563049771. */
export declare const OSX_3_3_1_1563049771: ClientVersion;
/** Windows 5.0.0-alpha-267, build 1563202431. */
export declare const Windows_5_0_0_alpha_267_1563202431: ClientVersion;
/** Windows 5.0.0-alpha268, build 1563300665. */
export declare const Windows_5_0_0_alpha268_1563300665: ClientVersion;
/** macOS 5.0.0-alpha268, build 1563300665. */
export declare const macOS_5_0_0_alpha268_1563300665: ClientVersion;
/** Windows 5.0.0-alpha269, build 1563374719. */
export declare const Windows_5_0_0_alpha269_1563374719: ClientVersion;
/** Windows 5.0.0-alpha275, build 1563647591. */
export declare const Windows_5_0_0_alpha275_1563647591: ClientVersion;
/** Windows 5.0.0-max-updater-test-3, build 1563793735. */
export declare const Windows_5_0_0_max_updater_test_3_1563793735: ClientVersion;
/** Windows 5.0.0-alpha279, build 1563868868. */
export declare const Windows_5_0_0_alpha279_1563868868: ClientVersion;
/** macOS 5.0.0-alpha282, build 1563983977. */
export declare const macOS_5_0_0_alpha282_1563983977: ClientVersion;
/** Windows 5.0.0-alpha283, build 1563988444. */
export declare const Windows_5_0_0_alpha283_1563988444: ClientVersion;
/** macOS 5.0.0-alpha283, build 1563988444. */
export declare const macOS_5_0_0_alpha283_1563988444: ClientVersion;
/** OS X 3.3.1, build 1563999377. */
export declare const OSX_3_3_1_1563999377: ClientVersion;
/** Windows 3.3.1, build 1564146308. */
export declare const Windows_3_3_1_1564146308: ClientVersion;
/** OS X 3.3.1, build 1564146308. */
export declare const OSX_3_3_1_1564146308: ClientVersion;
/** Windows 5.0.0-alex-scroll-test-1, build 1564164327. */
export declare const Windows_5_0_0_alex_scroll_test_1_1564164327: ClientVersion;
/** OS X 3.3.1, build 1564391039. */
export declare const OSX_3_3_1_1564391039: ClientVersion;
/** Windows 5.0.0-alpha291, build 1564408069. */
export declare const Windows_5_0_0_alpha291_1564408069: ClientVersion;
/** macOS 5.0.0-alpha291, build 1564408069. */
export declare const macOS_5_0_0_alpha291_1564408069: ClientVersion;
/** Windows 5.0.0-alpha292, build 1564497029. */
export declare const Windows_5_0_0_alpha292_1564497029: ClientVersion;
/** macOS 5.0.0-alpha292, build 1564497029. */
export declare const macOS_5_0_0_alpha292_1564497029: ClientVersion;
/** Windows 5.0.0-alpha293, build 1564586764. */
export declare const Windows_5_0_0_alpha293_1564586764: ClientVersion;
/** Windows 5.0.0-alpha295, build 1564653261. */
export declare const Windows_5_0_0_alpha295_1564653261: ClientVersion;
/** Android 3.3.1, build 1564671328. */
export declare const Android_3_3_1_1564671328: ClientVersion;
/** Android 3.3.1, build 1564678999. */
export declare const Android_3_3_1_1564678999: ClientVersion;
/** OS X 3.3.1, build 1564695891. */
export declare const OSX_3_3_1_1564695891: ClientVersion;
/** Windows 5.0.0-alpha300, build 1564750918. */
export declare const Windows_5_0_0_alpha300_1564750918: ClientVersion;
/** macOS 5.0.0-alpha300, build 1564750918. */
export declare const macOS_5_0_0_alpha300_1564750918: ClientVersion;
/** Windows 5.0.0-alpha302, build 1565122993. */
export declare const Windows_5_0_0_alpha302_1565122993: ClientVersion;
/** Windows 5.0.0-alpha304, build 1565173045. */
export declare const Windows_5_0_0_alpha304_1565173045: ClientVersion;
/** macOS 5.0.0-alpha306, build 1565180063. */
export declare const macOS_5_0_0_alpha306_1565180063: ClientVersion;
/** Windows 5.0.0-alpha308, build 1565255370. */
export declare const Windows_5_0_0_alpha308_1565255370: ClientVersion;
/** OS X 3.3.1, build 1565359284. */
export declare const OSX_3_3_1_1565359284: ClientVersion;
/** Windows 5.0.0-alpha312, build 1565621064. */
export declare const Windows_5_0_0_alpha312_1565621064: ClientVersion;
/** Windows 5.0.0-alpha313, build 1565694680. */
export declare const Windows_5_0_0_alpha313_1565694680: ClientVersion;
/** Windows 5.0.0-alpha314, build 1565805211. */
export declare const Windows_5_0_0_alpha314_1565805211: ClientVersion;
/** Windows 3.5.0, build 1565805756. */
export declare const Windows_3_5_0_1565805756: ClientVersion;
/** Windows 5.0.0-alpha316, build 1565975113. */
export declare const Windows_5_0_0_alpha316_1565975113: ClientVersion;
/** Windows 5.0.0-alpha317, build 1566233926. */
export declare const Windows_5_0_0_alpha317_1566233926: ClientVersion;
/** OS X 3.5.0, build 1566479450. */
export declare const OSX_3_5_0_1566479450: ClientVersion;
/** Windows 5.0.0-alpha319, build 1566479610. */
export declare const Windows_5_0_0_alpha319_1566479610: ClientVersion;
/** macOS 5.0.0-alpha319, build 1566479610. */
export declare const macOS_5_0_0_alpha319_1566479610: ClientVersion;
/** Windows 3.3.1, build 1566673023. */
export declare const Windows_3_3_1_1566673023: ClientVersion;
/** Linux 3.3.1, build 1566673023. */
export declare const Linux_3_3_1_1566673023: ClientVersion;
/** OS X 3.3.1, build 1566673023. */
export declare const OSX_3_3_1_1566673023: ClientVersion;
/** Windows 3.3.2, build 1566767614. */
export declare const Windows_3_3_2_1566767614: ClientVersion;
/** Linux 3.3.2, build 1566767614. */
export declare const Linux_3_3_2_1566767614: ClientVersion;
/** OS X 3.3.2, build 1566767614. */
export declare const OSX_3_3_2_1566767614: ClientVersion;
/** Windows 3.5.0, build 1566810730. */
export declare const Windows_3_5_0_1566810730: ClientVersion;
/** Windows 5.0.0-alpha324, build 1566898458. */
export declare const Windows_5_0_0_alpha324_1566898458: ClientVersion;
/** Windows 3.5.0, build 1566914096. */
export declare const Windows_3_5_0_1566914096: ClientVersion;
/** OS X 3.5.0, build 1566914096. */
export declare const OSX_3_5_0_1566914096: ClientVersion;
/** Windows 5.0.0-alpha325, build 1567003912. */
export declare const Windows_5_0_0_alpha325_1567003912: ClientVersion;
/** Windows 5.0.0-alpha327, build 1567025817. */
export declare const Windows_5_0_0_alpha327_1567025817: ClientVersion;
/** Windows 5.0.0-alpha329, build 1567160967. */
export declare const Windows_5_0_0_alpha329_1567160967: ClientVersion;
/** Windows 5.0.0-cef-77-test-9, build 1567209083. */
export declare const Windows_5_0_0_cef_77_test_9_1567209083: ClientVersion;
/** Windows 5.0.0-alpha330, build 1567246409. */
export declare const Windows_5_0_0_alpha330_1567246409: ClientVersion;
/** Windows 5.0.0-alpha332, build 1567435866. */
export declare const Windows_5_0_0_alpha332_1567435866: ClientVersion;
/** Windows 5.0.0-alpha333, build 1567450575. */
export declare const Windows_5_0_0_alpha333_1567450575: ClientVersion;
/** Windows 5.0.0-alpha334, build 1567590370. */
export declare const Windows_5_0_0_alpha334_1567590370: ClientVersion;
/** Windows 5.0.0-alpha335, build 1567603533. */
export declare const Windows_5_0_0_alpha335_1567603533: ClientVersion;
/** Windows 5.0.0-alpha336, build 1567680535. */
export declare const Windows_5_0_0_alpha336_1567680535: ClientVersion;
/** Windows 3.5.0, build 1567687511. */
export declare const Windows_3_5_0_1567687511: ClientVersion;
/** Windows 5.0.0-alpha337, build 1567692133. */
export declare const Windows_5_0_0_alpha337_1567692133: ClientVersion;
/** Windows 5.0.0-alpha338, build 1567761846. */
export declare const Windows_5_0_0_alpha338_1567761846: ClientVersion;
/** Windows 3.5.0, build 1567775523. */
export declare const Windows_3_5_0_1567775523: ClientVersion;
/** OS X 3.5.0, build 1567775523. */
export declare const OSX_3_5_0_1567775523: ClientVersion;
/** Windows 5.0.0-alpha339, build 1567776032. */
export declare const Windows_5_0_0_alpha339_1567776032: ClientVersion;
/** Windows 5.0.0-alpha340, build 1568047589. */
export declare const Windows_5_0_0_alpha340_1568047589: ClientVersion;
/** Windows 5.0.0-alpha341, build 1568138230. */
export declare const Windows_5_0_0_alpha341_1568138230: ClientVersion;
/** macOS 5.0.0-alpha341, build 1568138230. */
export declare const macOS_5_0_0_alpha341_1568138230: ClientVersion;
/** Windows 5.0.0-alpha342, build 1568216929. */
export declare const Windows_5_0_0_alpha342_1568216929: ClientVersion;
/** Windows 5.0.0-alpha343, build 1568303604. */
export declare const Windows_5_0_0_alpha343_1568303604: ClientVersion;
/** Windows 5.0.0-alpha345, build 1568462524. */
export declare const Windows_5_0_0_alpha345_1568462524: ClientVersion;
/** Windows 3.5.0, build 1568483207. */
export declare const Windows_3_5_0_1568483207: ClientVersion;
/** Windows 5.0.0-alpha347, build 1568498600. */
export declare const Windows_5_0_0_alpha347_1568498600: ClientVersion;
/** Windows 5.0.0-alpha348, build 1568542448. */
export declare const Windows_5_0_0_alpha348_1568542448: ClientVersion;
/** macOS 5.0.0-alpha349, build 1568550521. */
export declare const macOS_5_0_0_alpha349_1568550521: ClientVersion;
/** Windows 3.5.0, build 1568734736. */
export declare const Windows_3_5_0_1568734736: ClientVersion;
/** Linux 3.5.0, build 1568734736. */
export declare const Linux_3_5_0_1568734736: ClientVersion;
/** OS X 3.5.0, build 1568734736. */
export declare const OSX_3_5_0_1568734736: ClientVersion;
/** Windows 5.0.0-alpha352, build 1568742967. */
export declare const Windows_5_0_0_alpha352_1568742967: ClientVersion;
/** macOS 5.0.0-alpha353, build 1568828473. */
export declare const macOS_5_0_0_alpha353_1568828473: ClientVersion;
/** Windows 5.0.0-alpha354, build 1568887729. */
export declare const Windows_5_0_0_alpha354_1568887729: ClientVersion;
/** Windows 5.0.0-alpha355, build 1569001691. */
export declare const Windows_5_0_0_alpha355_1569001691: ClientVersion;
/** Windows 5.0.0-alpha356, build 1569007610. */
export declare const Windows_5_0_0_alpha356_1569007610: ClientVersion;
/** Windows 5.0.0-alpha357, build 1569014091. */
export declare const Windows_5_0_0_alpha357_1569014091: ClientVersion;
/** macOS 5.0.0-alpha357, build 1569014091. */
export declare const macOS_5_0_0_alpha357_1569014091: ClientVersion;
/** Windows 5.0.0-alpha362, build 1569439429. */
export declare const Windows_5_0_0_alpha362_1569439429: ClientVersion;
/** Windows 5.0.0-alpha366, build 1569577640. */
export declare const Windows_5_0_0_alpha366_1569577640: ClientVersion;
/** Windows 5.0.0-alpha369, build 1569852696. */
export declare const Windows_5_0_0_alpha369_1569852696: ClientVersion;
/** Linux 5.0.0-alpha369, build 1569852696. */
export declare const Linux_5_0_0_alpha369_1569852696: ClientVersion;
/** macOS 5.0.0-alpha369, build 1569852696. */
export declare const macOS_5_0_0_alpha369_1569852696: ClientVersion;
/** Windows 5.0.0-alpha370, build 1569948695. */
export declare const Windows_5_0_0_alpha370_1569948695: ClientVersion;
/** Linux 5.0.0-alpha370, build 1569948695. */
export declare const Linux_5_0_0_alpha370_1569948695: ClientVersion;
/** macOS 5.0.0-alpha370, build 1569948695. */
export declare const macOS_5_0_0_alpha370_1569948695: ClientVersion;
/** macOS 5.0.0-alpha373, build 1570024161. */
export declare const macOS_5_0_0_alpha373_1570024161: ClientVersion;
/** Windows 5.0.0-alpha376, build 1570136727. */
export declare const Windows_5_0_0_alpha376_1570136727: ClientVersion;
/** Windows 5.0.0-alpha377, build 1570211017. */
export declare const Windows_5_0_0_alpha377_1570211017: ClientVersion;
/** macOS 5.0.0-alpha377, build 1570211017. */
export declare const macOS_5_0_0_alpha377_1570211017: ClientVersion;
/** Windows 5.0.0-alpha379, build 1570306886. */
export declare const Windows_5_0_0_alpha379_1570306886: ClientVersion;
/** macOS 5.0.0-alpha379, build 1570306886. */
export declare const macOS_5_0_0_alpha379_1570306886: ClientVersion;
/** macOS 5.0.0-alpha380, build 1570376142. */
export declare const macOS_5_0_0_alpha380_1570376142: ClientVersion;
/** Windows 5.0.0-alpha381, build 1570394174. */
export declare const Windows_5_0_0_alpha381_1570394174: ClientVersion;
/** Windows 5.0.0-alpha.383, build 1570427845. */
export declare const Windows_5_0_0_alpha_383_1570427845: ClientVersion;
/** Windows 5.0.0-alpha.384, build 1570457406. */
export declare const Windows_5_0_0_alpha_384_1570457406: ClientVersion;
/** Windows 5.0.0-alpha.385, build 1570480817. */
export declare const Windows_5_0_0_alpha_385_1570480817: ClientVersion;
/** Linux 5.0.0-alpha.385, build 1570480817. */
export declare const Linux_5_0_0_alpha_385_1570480817: ClientVersion;
/** macOS 5.0.0-alpha.385, build 1570480817. */
export declare const macOS_5_0_0_alpha_385_1570480817: ClientVersion;
/** Windows 5.0.0-alpha.389, build 1570642878. */
export declare const Windows_5_0_0_alpha_389_1570642878: ClientVersion;
/** macOS 5.0.0-alpha.389, build 1570642878. */
export declare const macOS_5_0_0_alpha_389_1570642878: ClientVersion;
/** Windows 5.0.0-alpha.390, build 1570728651. */
export declare const Windows_5_0_0_alpha_390_1570728651: ClientVersion;
/** iOS 3.5.0, build 1570810399. */
export declare const iOS_3_5_0_1570810399: ClientVersion;
/** Windows 3.5.0, build 1570811287. */
export declare const Windows_3_5_0_1570811287: ClientVersion;
/** OS X 3.5.0, build 1570811287. */
export declare const OSX_3_5_0_1570811287: ClientVersion;
/** Windows 5.0.0-alpha.392, build 1570909746. */
export declare const Windows_5_0_0_alpha_392_1570909746: ClientVersion;
/** Windows 5.0.0-alpha.393, build 1570924185. */
export declare const Windows_5_0_0_alpha_393_1570924185: ClientVersion;
/** Windows 5.0.0-alpha.395, build 1570968752. */
export declare const Windows_5_0_0_alpha_395_1570968752: ClientVersion;
/** Windows 5.0.0-beta.1, build 1571050541. */
export declare const Windows_5_0_0_beta_1_1571050541: ClientVersion;
/** Linux 5.0.0-beta.1, build 1571050541. */
export declare const Linux_5_0_0_beta_1_1571050541: ClientVersion;
/** macOS 5.0.0-beta.1, build 1571050541. */
export declare const macOS_5_0_0_beta_1_1571050541: ClientVersion;
/** Windows 3.5.0, build 1571080050. */
export declare const Windows_3_5_0_1571080050: ClientVersion;
/** Linux 3.5.0, build 1571080050. */
export declare const Linux_3_5_0_1571080050: ClientVersion;
/** OS X 3.5.0, build 1571080050. */
export declare const OSX_3_5_0_1571080050: ClientVersion;
/** Windows 5.0.0-beta.2, build 1571087114. */
export declare const Windows_5_0_0_beta_2_1571087114: ClientVersion;
/** Linux 5.0.0-beta.2, build 1571087114. */
export declare const Linux_5_0_0_beta_2_1571087114: ClientVersion;
/** macOS 5.0.0-beta.2, build 1571087114. */
export declare const macOS_5_0_0_beta_2_1571087114: ClientVersion;
/** Windows 5.0.0-beta.3, build 1571155625. */
export declare const Windows_5_0_0_beta_3_1571155625: ClientVersion;
/** Windows 5.0.0-beta.3, build 1571214214. */
export declare const Windows_5_0_0_beta_3_1571214214: ClientVersion;
/** Linux 5.0.0-beta.3, build 1571214214. */
export declare const Linux_5_0_0_beta_3_1571214214: ClientVersion;
/** macOS 5.0.0-beta.3, build 1571214214. */
export declare const macOS_5_0_0_beta_3_1571214214: ClientVersion;
/** macOS 5.0.0-beta.5, build 1571252771. */
export declare const macOS_5_0_0_beta_5_1571252771: ClientVersion;
/** macOS 5.0.0-beta.6, build 1571338027. */
export declare const macOS_5_0_0_beta_6_1571338027: ClientVersion;
/** Windows 5.0.0-mute_test.1, build 1571396541. */
export declare const Windows_5_0_0_mute_test_1_1571396541: ClientVersion;
/** Windows 5.0.0-beta.7, build 1571421490. */
export declare const Windows_5_0_0_beta_7_1571421490: ClientVersion;
/** Linux 5.0.0-beta.7, build 1571421490. */
export declare const Linux_5_0_0_beta_7_1571421490: ClientVersion;
/** macOS 5.0.0-beta.7, build 1571421490. */
export declare const macOS_5_0_0_beta_7_1571421490: ClientVersion;
/** Windows 5.0.0-beta.8, build 1571671044. */
export declare const Windows_5_0_0_beta_8_1571671044: ClientVersion;
/** Linux 5.0.0-beta.8, build 1571671044. */
export declare const Linux_5_0_0_beta_8_1571671044: ClientVersion;
/** macOS 5.0.0-beta.8, build 1571671044. */
export declare const macOS_5_0_0_beta_8_1571671044: ClientVersion;
/** Windows 5.0.0-beta.9, build 1571949734. */
export declare const Windows_5_0_0_beta_9_1571949734: ClientVersion;
/** Linux 5.0.0-beta.9, build 1571949734. */
export declare const Linux_5_0_0_beta_9_1571949734: ClientVersion;
/** macOS 5.0.0-beta.9, build 1571949734. */
export declare const macOS_5_0_0_beta_9_1571949734: ClientVersion;
/** Windows 5.0.0-beta.10, build 1572213852. */
export declare const Windows_5_0_0_beta_10_1572213852: ClientVersion;
/** macOS 5.0.0-beta.10, build 1572213852. */
export declare const macOS_5_0_0_beta_10_1572213852: ClientVersion;
/** OS X 3.5.0, build 1572274459. */
export declare const OSX_3_5_0_1572274459: ClientVersion;
/** Windows 5.0.0-inbox-update-test-3, build 1572358097. */
export declare const Windows_5_0_0_inbox_update_test_3_1572358097: ClientVersion;
/** OS X 3.5.0, build 1572367939. */
export declare const OSX_3_5_0_1572367939: ClientVersion;
/** Linux 5.0.0-017dbfce, build 1572429535. */
export declare const Linux_5_0_0_017dbfce_1572429535: ClientVersion;
/** Windows 3.5.0, build 1572447082. */
export declare const Windows_3_5_0_1572447082: ClientVersion;
/** Linux 3.5.0, build 1572447082. */
export declare const Linux_3_5_0_1572447082: ClientVersion;
/** OS X 3.5.0, build 1572447082. */
export declare const OSX_3_5_0_1572447082: ClientVersion;
/** Windows 5.0.0-test.1, build 1572609725. */
export declare const Windows_5_0_0_test_1_1572609725: ClientVersion;
/** macOS 5.0.0-test.1, build 1572609725. */
export declare const macOS_5_0_0_test_1_1572609725: ClientVersion;
/** Windows 5.0.0-beta.12, build 1572868115. */
export declare const Windows_5_0_0_beta_12_1572868115: ClientVersion;
/** Linux 5.0.0-beta.12, build 1572868115. */
export declare const Linux_5_0_0_beta_12_1572868115: ClientVersion;
/** macOS 5.0.0-beta.12, build 1572868115. */
export declare const macOS_5_0_0_beta_12_1572868115: ClientVersion;
/** macOS 5.0.0-test.2, build 1572958346. */
export declare const macOS_5_0_0_test_2_1572958346: ClientVersion;
/** macOS 5.0.0-beta.13, build 1572974727. */
export declare const macOS_5_0_0_beta_13_1572974727: ClientVersion;
/** macOS 5.0.0-test.3, build 1573037288. */
export declare const macOS_5_0_0_test_3_1573037288: ClientVersion;
/** Windows 5.0.0-test.6, build 1573147021. */
export declare const Windows_5_0_0_test_6_1573147021: ClientVersion;
/** macOS 5.0.0-test.6, build 1573147021. */
export declare const macOS_5_0_0_test_6_1573147021: ClientVersion;
/** Windows 5.0.0-test.9, build 1573214586. */
export declare const Windows_5_0_0_test_9_1573214586: ClientVersion;
/** Windows 5.0.0-test.11, build 1573316935. */
export declare const Windows_5_0_0_test_11_1573316935: ClientVersion;
/** macOS 5.0.0-test.11, build 1573316935. */
export declare const macOS_5_0_0_test_11_1573316935: ClientVersion;
/** Windows 5.0.0-test.12, build 1573502287. */
export declare const Windows_5_0_0_test_12_1573502287: ClientVersion;
/** macOS 5.0.0-test.12, build 1573502287. */
export declare const macOS_5_0_0_test_12_1573502287: ClientVersion;
/** Windows 5.0.0-test.16, build 1573563185. */
export declare const Windows_5_0_0_test_16_1573563185: ClientVersion;
/** Windows 5.0.0-beta.15, build 1573580845. */
export declare const Windows_5_0_0_beta_15_1573580845: ClientVersion;
/** Linux 5.0.0-beta.15, build 1573580845. */
export declare const Linux_5_0_0_beta_15_1573580845: ClientVersion;
/** macOS 5.0.0-beta.15, build 1573580845. */
export declare const macOS_5_0_0_beta_15_1573580845: ClientVersion;
/** Windows 5.0.0-test.17, build 1573581231. */
export declare const Windows_5_0_0_test_17_1573581231: ClientVersion;
/** Windows 5.0.0-beta.16, build 1573593194. */
export declare const Windows_5_0_0_beta_16_1573593194: ClientVersion;
/** Linux 5.0.0-beta.16, build 1573593194. */
export declare const Linux_5_0_0_beta_16_1573593194: ClientVersion;
/** macOS 5.0.0-beta.16, build 1573593194. */
export declare const macOS_5_0_0_beta_16_1573593194: ClientVersion;
/** Linux 3.5.0, build 1573741018. */
export declare const Linux_3_5_0_1573741018: ClientVersion;
/** OS X 3.5.0, build 1573741018. */
export declare const OSX_3_5_0_1573741018: ClientVersion;
/** iOS 3.5.0, build 1574093735. */
export declare const iOS_3_5_0_1574093735: ClientVersion;
/** Windows 5.0.0-test.18, build 1574258541. */
export declare const Windows_5_0_0_test_18_1574258541: ClientVersion;
/** Windows 5.0.0-test.19, build 1574273002. */
export declare const Windows_5_0_0_test_19_1574273002: ClientVersion;
/** Windows 5.0.0-test.20, build 1574327385. */
export declare const Windows_5_0_0_test_20_1574327385: ClientVersion;
/** Windows 5.0.0-test.21, build 1574343180. */
export declare const Windows_5_0_0_test_21_1574343180: ClientVersion;
/** Linux 5.0.0-test.21, build 1574343180. */
export declare const Linux_5_0_0_test_21_1574343180: ClientVersion;
/** macOS 5.0.0-test.21, build 1574343180. */
export declare const macOS_5_0_0_test_21_1574343180: ClientVersion;
/** iOS 3.5.0, build 1574357871. */
export declare const iOS_3_5_0_1574357871: ClientVersion;
/** Windows 5.0.0-test.22, build 1574873227. */
export declare const Windows_5_0_0_test_22_1574873227: ClientVersion;
/** Windows 5.0.0-test.23, build 1574935289. */
export declare const Windows_5_0_0_test_23_1574935289: ClientVersion;
/** Android 3.5.0, build 1574942993. */
export declare const Android_3_5_0_1574942993: ClientVersion;
/** macOS 5.0.0-test.24, build 1575287495. */
export declare const macOS_5_0_0_test_24_1575287495: ClientVersion;
/** Windows 3.5.0, build 1575318320. */
export declare const Windows_3_5_0_1575318320: ClientVersion;
/** OS X 3.5.0, build 1575318320. */
export declare const OSX_3_5_0_1575318320: ClientVersion;
/** Windows 5.0.0-test.25, build 1575368044. */
export declare const Windows_5_0_0_test_25_1575368044: ClientVersion;
/** Windows 5.0.0-test.26, build 1575420598. */
export declare const Windows_5_0_0_test_26_1575420598: ClientVersion;
/** Linux 5.0.0-test.26, build 1575420598. */
export declare const Linux_5_0_0_test_26_1575420598: ClientVersion;
/** macOS 5.0.0-test.26, build 1575420598. */
export declare const macOS_5_0_0_test_26_1575420598: ClientVersion;
/** macOS 5.0.0-test.28, build 1575626623. */
export declare const macOS_5_0_0_test_28_1575626623: ClientVersion;
/** OS X 3.5.0, build 1575804173. */
export declare const OSX_3_5_0_1575804173: ClientVersion;
/** Windows 3.5.0, build 1575870843. */
export declare const Windows_3_5_0_1575870843: ClientVersion;
/** Windows 5.0.0-test.29, build 1575906492. */
export declare const Windows_5_0_0_test_29_1575906492: ClientVersion;
/** Windows 5.0.0-test.30, build 1575953901. */
export declare const Windows_5_0_0_test_30_1575953901: ClientVersion;
/** Windows 5.0.0-beta.17, build 1575970903. */
export declare const Windows_5_0_0_beta_17_1575970903: ClientVersion;
/** Linux 5.0.0-beta.17, build 1575970903. */
export declare const Linux_5_0_0_beta_17_1575970903: ClientVersion;
/** macOS 5.0.0-beta.17, build 1575970903. */
export declare const macOS_5_0_0_beta_17_1575970903: ClientVersion;
/** Windows 5.0.0-test.31, build 1576066245. */
export declare const Windows_5_0_0_test_31_1576066245: ClientVersion;
/** Windows 3.5.0, build 1576090604. */
export declare const Windows_3_5_0_1576090604: ClientVersion;
/** Windows 3.5.0, build 1576181443. */
export declare const Windows_3_5_0_1576181443: ClientVersion;
/** Windows 3.5.0, build 1576513599. */
export declare const Windows_3_5_0_1576513599: ClientVersion;
/** Windows 3.5.0, build 1576585064. */
export declare const Windows_3_5_0_1576585064: ClientVersion;
/** Windows 5.0.0-test.32, build 1576586323. */
export declare const Windows_5_0_0_test_32_1576586323: ClientVersion;
/** Windows 3.5.0, build 1576687348. */
export declare const Windows_3_5_0_1576687348: ClientVersion;
/** Linux 3.5.0, build 1576687348. */
export declare const Linux_3_5_0_1576687348: ClientVersion;
/** Windows 5.0.0-test.33, build 1576756659. */
export declare const Windows_5_0_0_test_33_1576756659: ClientVersion;
/** macOS 5.0.0-test.33, build 1576756659. */
export declare const macOS_5_0_0_test_33_1576756659: ClientVersion;
/** Windows 3.5.0, build 1576757477. */
export declare const Windows_3_5_0_1576757477: ClientVersion;
/** Linux 3.5.0, build 1576757477. */
export declare const Linux_3_5_0_1576757477: ClientVersion;
/** OS X 3.5.0, build 1576757477. */
export declare const OSX_3_5_0_1576757477: ClientVersion;
/** Windows 5.0.0-beta.18, build 1576838043. */
export declare const Windows_5_0_0_beta_18_1576838043: ClientVersion;
/** Linux 5.0.0-beta.18, build 1576838043. */
export declare const Linux_5_0_0_beta_18_1576838043: ClientVersion;
/** macOS 5.0.0-beta.18, build 1576838043. */
export declare const macOS_5_0_0_beta_18_1576838043: ClientVersion;
/** Windows 3.5.0, build 1576948785. */
export declare const Windows_3_5_0_1576948785: ClientVersion;
/** Windows 3.5.0, build 1577821118. */
export declare const Windows_3_5_0_1577821118: ClientVersion;
/** Windows 3.5.0, build 1578164171. */
export declare const Windows_3_5_0_1578164171: ClientVersion;
/** Windows 3.5.0, build 1578400308. */
export declare const Windows_3_5_0_1578400308: ClientVersion;
/** Windows 3.5.0, build 1578417881. */
export declare const Windows_3_5_0_1578417881: ClientVersion;
/** Linux 3.5.0, build 1578417881. */
export declare const Linux_3_5_0_1578417881: ClientVersion;
/** Windows 5.0.0-test.35, build 1578591798. */
export declare const Windows_5_0_0_test_35_1578591798: ClientVersion;
/** macOS 5.0.0-test.35, build 1578591798. */
export declare const macOS_5_0_0_test_35_1578591798: ClientVersion;
/** Windows 3.5.0, build 1578609201. */
export declare const Windows_3_5_0_1578609201: ClientVersion;
/** Linux 3.5.0, build 1578609201. */
export declare const Linux_3_5_0_1578609201: ClientVersion;
/** Windows 3.5.0, build 1578696214. */
export declare const Windows_3_5_0_1578696214: ClientVersion;
/** Windows 3.5.0, build 1578859029. */
export declare const Windows_3_5_0_1578859029: ClientVersion;
/** Windows 3.5.0, build 1578906268. */
export declare const Windows_3_5_0_1578906268: ClientVersion;
/** Linux 3.5.0, build 1578906268. */
export declare const Linux_3_5_0_1578906268: ClientVersion;
/** Windows 5.0.0-test.38, build 1579022578. */
export declare const Windows_5_0_0_test_38_1579022578: ClientVersion;
/** Windows 3.5.0, build 1579162934. */
export declare const Windows_3_5_0_1579162934: ClientVersion;
/** Linux 3.5.0, build 1579162934. */
export declare const Linux_3_5_0_1579162934: ClientVersion;
/** Windows 3.5.0, build 1579271398. */
export declare const Windows_3_5_0_1579271398: ClientVersion;
/** Linux 3.5.0, build 1579271398. */
export declare const Linux_3_5_0_1579271398: ClientVersion;
/** OS X 3.5.0, build 1579271398. */
export declare const OSX_3_5_0_1579271398: ClientVersion;
/** Windows 5.0.0-test.51, build 1579367787. */
export declare const Windows_5_0_0_test_51_1579367787: ClientVersion;
/** Windows 5.0.0-test.52, build 1579512204. */
export declare const Windows_5_0_0_test_52_1579512204: ClientVersion;
/** Windows 3.5.0, build 1579611798. */
export declare const Windows_3_5_0_1579611798: ClientVersion;
/** Windows 5.0.0-test.55, build 1579622615. */
export declare const Windows_5_0_0_test_55_1579622615: ClientVersion;
/** Windows 3.5.0, build 1579686935. */
export declare const Windows_3_5_0_1579686935: ClientVersion;
/** Linux 3.5.0, build 1579686935. */
export declare const Linux_3_5_0_1579686935: ClientVersion;
/** OS X 3.5.0, build 1579686935. */
export declare const OSX_3_5_0_1579686935: ClientVersion;
/** Windows 5.0.0-test.56, build 1579699914. */
export declare const Windows_5_0_0_test_56_1579699914: ClientVersion;
/** Windows 5.0.0-test.57, build 1579705006. */
export declare const Windows_5_0_0_test_57_1579705006: ClientVersion;
/** Windows 5.0.0-beta.19, build 1579708986. */
export declare const Windows_5_0_0_beta_19_1579708986: ClientVersion;
/** Linux 5.0.0-beta.19, build 1579708986. */
export declare const Linux_5_0_0_beta_19_1579708986: ClientVersion;
/** macOS 5.0.0-beta.19, build 1579708986. */
export declare const macOS_5_0_0_beta_19_1579708986: ClientVersion;
/** Windows 5.0.0-test.58, build 1579878094. */
export declare const Windows_5_0_0_test_58_1579878094: ClientVersion;
/** macOS 5.0.0-test.58, build 1579878094. */
export declare const macOS_5_0_0_test_58_1579878094: ClientVersion;
/** Windows 3.5.0, build 1579960421. */
export declare const Windows_3_5_0_1579960421: ClientVersion;
/** Windows 3.5.0, build 1580143599. */
export declare const Windows_3_5_0_1580143599: ClientVersion;
/** Linux 3.5.0, build 1580143599. */
export declare const Linux_3_5_0_1580143599: ClientVersion;
/** OS X 3.5.0, build 1580143599. */
export declare const OSX_3_5_0_1580143599: ClientVersion;
/** Windows 5.0.0-test.59, build 1580226872. */
export declare const Windows_5_0_0_test_59_1580226872: ClientVersion;
/** macOS 5.0.0-test.59, build 1580226872. */
export declare const macOS_5_0_0_test_59_1580226872: ClientVersion;
/** Windows 3.5.0, build 1580316377. */
export declare const Windows_3_5_0_1580316377: ClientVersion;
/** Linux 3.5.0, build 1580316377. */
export declare const Linux_3_5_0_1580316377: ClientVersion;
/** OS X 3.5.0, build 1580316377. */
export declare const OSX_3_5_0_1580316377: ClientVersion;
/** Windows 3.5.0, build 1580593763. */
export declare const Windows_3_5_0_1580593763: ClientVersion;
/** Windows 3.5.0, build 1580672591. */
export declare const Windows_3_5_0_1580672591: ClientVersion;
/** Windows 5.0.0-test.60, build 1580683977. */
export declare const Windows_5_0_0_test_60_1580683977: ClientVersion;
/** macOS 5.0.0-test.63, build 1580751860. */
export declare const macOS_5_0_0_test_63_1580751860: ClientVersion;
/** Windows 3.5.0, build 1580753736. */
export declare const Windows_3_5_0_1580753736: ClientVersion;
/** Windows 5.0.0-test.65, build 1580774583. */
export declare const Windows_5_0_0_test_65_1580774583: ClientVersion;
/** Windows 5.0.0-beta.20, build 1580775353. */
export declare const Windows_5_0_0_beta_20_1580775353: ClientVersion;
/** Linux 5.0.0-beta.20, build 1580775353. */
export declare const Linux_5_0_0_beta_20_1580775353: ClientVersion;
/** macOS 5.0.0-beta.20, build 1580775353. */
export declare const macOS_5_0_0_beta_20_1580775353: ClientVersion;
/** Windows 5.0.0-beta.21, build 1580832125. */
export declare const Windows_5_0_0_beta_21_1580832125: ClientVersion;
/** Windows 5.0.0-test.67, build 1580844878. */
export declare const Windows_5_0_0_test_67_1580844878: ClientVersion;
/** Windows 5.0.0-test.68, build 1580898716. */
export declare const Windows_5_0_0_test_68_1580898716: ClientVersion;
/** Windows 5.0.0-beta.21, build 1580909538. */
export declare const Windows_5_0_0_beta_21_1580909538: ClientVersion;
/** Linux 5.0.0-beta.21, build 1580909538. */
export declare const Linux_5_0_0_beta_21_1580909538: ClientVersion;
/** macOS 5.0.0-beta.21, build 1580909538. */
export declare const macOS_5_0_0_beta_21_1580909538: ClientVersion;
/** Windows 3.5.0, build 1581008757. */
export declare const Windows_3_5_0_1581008757: ClientVersion;
/** Windows 3.5.0, build 1581019294. */
export declare const Windows_3_5_0_1581019294: ClientVersion;
/** Windows 3.5.0, build 1581183683. */
export declare const Windows_3_5_0_1581183683: ClientVersion;
/** Windows 3.5.0, build 1581524851. */
export declare const Windows_3_5_0_1581524851: ClientVersion;
/** Windows 3.5.0, build 1581573435. */
export declare const Windows_3_5_0_1581573435: ClientVersion;
/** Windows 5.0.0-test.70, build 1581595773. */
export declare const Windows_5_0_0_test_70_1581595773: ClientVersion;
/** macOS 5.0.0-test.70, build 1581595773. */
export declare const macOS_5_0_0_test_70_1581595773: ClientVersion;
/** Windows 5.0.0-test.71, build 1581610274. */
export declare const Windows_5_0_0_test_71_1581610274: ClientVersion;
/** Windows 3.5.0, build 1581610500. */
export declare const Windows_3_5_0_1581610500: ClientVersion;
/** OS X 3.5.0, build 1581610500. */
export declare const OSX_3_5_0_1581610500: ClientVersion;
/** Windows 5.0.0-test.73, build 1581688728. */
export declare const Windows_5_0_0_test_73_1581688728: ClientVersion;
/** Windows 3.5.0, build 1581910955. */
export declare const Windows_3_5_0_1581910955: ClientVersion;
/** Windows 5.0.0-beta.22, build 1582011547. */
export declare const Windows_5_0_0_beta_22_1582011547: ClientVersion;
/** Linux 5.0.0-beta.22, build 1582011547. */
export declare const Linux_5_0_0_beta_22_1582011547: ClientVersion;
/** macOS 5.0.0-beta.22, build 1582011547. */
export declare const macOS_5_0_0_beta_22_1582011547: ClientVersion;
/** Android 3.5.0, build 1582117478. */
export declare const Android_3_5_0_1582117478: ClientVersion;
/** iOS 3.5.1, build 1582118844. */
export declare const iOS_3_5_1_1582118844: ClientVersion;
/** Windows 3.5.0, build 1582288251. */
export declare const Windows_3_5_0_1582288251: ClientVersion;
/** Android 3.5.0, build 1582632784. */
export declare const Android_3_5_0_1582632784: ClientVersion;
/** Windows 3.5.0, build 1582634532. */
export declare const Windows_3_5_0_1582634532: ClientVersion;
/** Linux 3.5.0, build 1582634532. */
export declare const Linux_3_5_0_1582634532: ClientVersion;
/** OS X 3.5.0, build 1582634532. */
export declare const OSX_3_5_0_1582634532: ClientVersion;
/** Linux 5.0.0-test.79, build 1582881429. */
export declare const Linux_5_0_0_test_79_1582881429: ClientVersion;
/** Windows 5.0.0-beta.23, build 1583314601. */
export declare const Windows_5_0_0_beta_23_1583314601: ClientVersion;
/** Linux 5.0.0-beta.23, build 1583314601. */
export declare const Linux_5_0_0_beta_23_1583314601: ClientVersion;
/** macOS 5.0.0-beta.23, build 1583314601. */
export declare const macOS_5_0_0_beta_23_1583314601: ClientVersion;
/** Windows 5.0.0-test.87, build 1583490334. */
export declare const Windows_5_0_0_test_87_1583490334: ClientVersion;
/** Linux 5.0.0-test.87, build 1583490334. */
export declare const Linux_5_0_0_test_87_1583490334: ClientVersion;
/** Windows 5.0.0-test.89, build 1584014675. */
export declare const Windows_5_0_0_test_89_1584014675: ClientVersion;
/** Windows 3.5.0, build 1584088288. */
export declare const Windows_3_5_0_1584088288: ClientVersion;
/** Linux 3.5.0, build 1584088288. */
export declare const Linux_3_5_0_1584088288: ClientVersion;
/** OS X 3.5.0, build 1584088288. */
export declare const OSX_3_5_0_1584088288: ClientVersion;
/** Windows 5.0.0-beta.24, build 1584452452. */
export declare const Windows_5_0_0_beta_24_1584452452: ClientVersion;
/** Windows 3.5.0, build 1584525989. */
export declare const Windows_3_5_0_1584525989: ClientVersion;
/** OS X 3.5.0, build 1584525989. */
export declare const OSX_3_5_0_1584525989: ClientVersion;
/** Windows 3.5.0, build 1584610661. */
export declare const Windows_3_5_0_1584610661: ClientVersion;
/** Linux 3.5.0, build 1584610661. */
export declare const Linux_3_5_0_1584610661: ClientVersion;
/** OS X 3.5.0, build 1584610661. */
export declare const OSX_3_5_0_1584610661: ClientVersion;
/** Windows 5.0.0-beta.24, build 1584621089. */
export declare const Windows_5_0_0_beta_24_1584621089: ClientVersion;
/** Linux 5.0.0-beta.24, build 1584621089. */
export declare const Linux_5_0_0_beta_24_1584621089: ClientVersion;
/** macOS 5.0.0-beta.24, build 1584621089. */
export declare const macOS_5_0_0_beta_24_1584621089: ClientVersion;
/** Windows 3.5.1, build 1584725003. */
export declare const Windows_3_5_1_1584725003: ClientVersion;
/** Windows 3.5.1, build 1584726885. */
export declare const Windows_3_5_1_1584726885: ClientVersion;
/** Windows 3.5.1, build 1584955996. */
export declare const Windows_3_5_1_1584955996: ClientVersion;
/** Linux 3.5.1, build 1584955996. */
export declare const Linux_3_5_1_1584955996: ClientVersion;
/** OS X 3.5.1, build 1584955996. */
export declare const OSX_3_5_1_1584955996: ClientVersion;
/** Windows 5.0.0-test.95, build 1585049319. */
export declare const Windows_5_0_0_test_95_1585049319: ClientVersion;
/** Windows 5.0.0-test.96, build 1585156359. */
export declare const Windows_5_0_0_test_96_1585156359: ClientVersion;
/** Windows 3.5.2, build 1585741147. */
export declare const Windows_3_5_2_1585741147: ClientVersion;
/** Linux 3.5.2, build 1585741147. */
export declare const Linux_3_5_2_1585741147: ClientVersion;
/** Windows 5.0.0-test.100, build 1585752032. */
export declare const Windows_5_0_0_test_100_1585752032: ClientVersion;
/** Windows 3.5.2, build 1585812952. */
export declare const Windows_3_5_2_1585812952: ClientVersion;
/** Linux 3.5.2, build 1585812952. */
export declare const Linux_3_5_2_1585812952: ClientVersion;
/** OS X 3.5.2, build 1585812952. */
export declare const OSX_3_5_2_1585812952: ClientVersion;
/** Windows 5.0.0-manage-permissions-8, build 1585925917. */
export declare const Windows_5_0_0_manage_permissions_8_1585925917: ClientVersion;
/** Windows 5.0.0-network-monitor-1, build 1586167450. */
export declare const Windows_5_0_0_network_monitor_1_1586167450: ClientVersion;
/** Windows 3.5.3, build 1586172156. */
export declare const Windows_3_5_3_1586172156: ClientVersion;
/** Linux 3.5.3, build 1586172156. */
export declare const Linux_3_5_3_1586172156: ClientVersion;
/** OS X 3.5.3, build 1586172156. */
export declare const OSX_3_5_3_1586172156: ClientVersion;
/** Windows 5.0.0-test.104, build 1586348340. */
export declare const Windows_5_0_0_test_104_1586348340: ClientVersion;
/** macOS 5.0.0-test.104, build 1586348340. */
export declare const macOS_5_0_0_test_104_1586348340: ClientVersion;
/** Windows 3.5.3, build 1586353391. */
export declare const Windows_3_5_3_1586353391: ClientVersion;
/** Windows 3.5.3, build 1586853103. */
export declare const Windows_3_5_3_1586853103: ClientVersion;
/** Windows 3.5.3, build 1586955962. */
export declare const Windows_3_5_3_1586955962: ClientVersion;
/** Linux 3.5.3, build 1586955962. */
export declare const Linux_3_5_3_1586955962: ClientVersion;
/** OS X 3.5.3, build 1586955962. */
export declare const OSX_3_5_3_1586955962: ClientVersion;
/** macOS 5.0.0-test.106, build 1587037548. */
export declare const macOS_5_0_0_test_106_1587037548: ClientVersion;
/** Windows 3.5.3, build 1587566168. */
export declare const Windows_3_5_3_1587566168: ClientVersion;
/** Linux 3.5.3, build 1587566168. */
export declare const Linux_3_5_3_1587566168: ClientVersion;
/** Windows 5.0.0-test.111, build 1587633723. */
export declare const Windows_5_0_0_test_111_1587633723: ClientVersion;
/** Windows 3.5.3, build 1587971024. */
export declare const Windows_3_5_3_1587971024: ClientVersion;
/** Linux 3.5.3, build 1587971024. */
export declare const Linux_3_5_3_1587971024: ClientVersion;
/** Windows 5.0.0-beta.25, build 1588064367. */
export declare const Windows_5_0_0_beta_25_1588064367: ClientVersion;
/** Linux 5.0.0-beta.25, build 1588064367. */
export declare const Linux_5_0_0_beta_25_1588064367: ClientVersion;
/** macOS 5.0.0-beta.25, build 1588064367. */
export declare const macOS_5_0_0_beta_25_1588064367: ClientVersion;
/** Windows 5.0.0-test.113, build 1588173300. */
export declare const Windows_5_0_0_test_113_1588173300: ClientVersion;
/** Windows 3.5.3, build 1588250739. */
export declare const Windows_3_5_3_1588250739: ClientVersion;
/** Windows 3.5.3, build 1588261372. */
export declare const Windows_3_5_3_1588261372: ClientVersion;
/** Windows 5.0.0-test.114, build 1588589210. */
export declare const Windows_5_0_0_test_114_1588589210: ClientVersion;
/** Linux 5.0.0-test.114, build 1588589210. */
export declare const Linux_5_0_0_test_114_1588589210: ClientVersion;
/** macOS 5.0.0-test.114, build 1588589210. */
export declare const macOS_5_0_0_test_114_1588589210: ClientVersion;
/** Windows 3.5.3, build 1588756070. */
export declare const Windows_3_5_3_1588756070: ClientVersion;
/** Linux 3.5.3, build 1588756070. */
export declare const Linux_3_5_3_1588756070: ClientVersion;
/** OS X 3.5.3, build 1588756070. */
export declare const OSX_3_5_3_1588756070: ClientVersion;
/** Windows 5.0.0-test.116, build 1590740393. */
export declare const Windows_5_0_0_test_116_1590740393: ClientVersion;
/** Windows 5.0.0-test.120, build 1592228855. */
export declare const Windows_5_0_0_test_120_1592228855: ClientVersion;
/** Windows 3.5.5, build 1594109255. */
export declare const Windows_3_5_5_1594109255: ClientVersion;
/** Linux 3.5.5, build 1594109255. */
export declare const Linux_3_5_5_1594109255: ClientVersion;
/** OS X 3.5.5, build 1594109255. */
export declare const OSX_3_5_5_1594109255: ClientVersion;
/** Windows 3.5.5, build 1594213121. */
export declare const Windows_3_5_5_1594213121: ClientVersion;
/** Linux 3.5.5, build 1594213121. */
export declare const Linux_3_5_5_1594213121: ClientVersion;
/** OS X 3.5.5, build 1594213121. */
export declare const OSX_3_5_5_1594213121: ClientVersion;
/** macOS 5.0.0-ui-polishing-2, build 1596738566. */
export declare const macOS_5_0_0_ui_polishing_2_1596738566: ClientVersion;
/** Windows 5.0.0-tschat-test-7, build 1597217264. */
export declare const Windows_5_0_0_tschat_test_7_1597217264: ClientVersion;
/** Windows 5.0.0-tschat-test-9, build 1597240212. */
export declare const Windows_5_0_0_tschat_test_9_1597240212: ClientVersion;
/** Windows 5.0.0-ui-polishing-4, build 1597390040. */
export declare const Windows_5_0_0_ui_polishing_4_1597390040: ClientVersion;
/** macOS 5.0.0-ui-polishing-4, build 1597390040. */
export declare const macOS_5_0_0_ui_polishing_4_1597390040: ClientVersion;
/** Windows 5.0.0-flag-test-3, build 1597393952. */
export declare const Windows_5_0_0_flag_test_3_1597393952: ClientVersion;
/** Windows 5.0.0-move-testing-1, build 1597499112. */
export declare const Windows_5_0_0_move_testing_1_1597499112: ClientVersion;
/** Windows 5.0.0-move-testing-2, build 1597522136. */
export declare const Windows_5_0_0_move_testing_2_1597522136: ClientVersion;
/** Windows 5.0.0-move-testing-4, build 1597581653. */
export declare const Windows_5_0_0_move_testing_4_1597581653: ClientVersion;
/** Windows 5.0.0-flag-test-4, build 1597915096. */
export declare const Windows_5_0_0_flag_test_4_1597915096: ClientVersion;
/** Windows 5.0.0-move-testing-7, build 1597931781. */
export declare const Windows_5_0_0_move_testing_7_1597931781: ClientVersion;
/** Windows 5.0.0-tschat-test-11, build 1598016546. */
export declare const Windows_5_0_0_tschat_test_11_1598016546: ClientVersion;
/** Windows 5.0.0-ui-polishing-5, build 1598262399. */
export declare const Windows_5_0_0_ui_polishing_5_1598262399: ClientVersion;
/** Windows 5.0.0-ui-polishing-6, build 1598444718. */
export declare const Windows_5_0_0_ui_polishing_6_1598444718: ClientVersion;
/** Windows 5.0.0-ui-polishing-7, build 1598531141. */
export declare const Windows_5_0_0_ui_polishing_7_1598531141: ClientVersion;
/** Windows 5.0.0-4f3ac28d8, build 1598636763. */
export declare const Windows_5_0_0_4f3ac28d8_1598636763: ClientVersion;
/** Windows 5.0.0-tschat-test-15, build 1599059062. */
export declare const Windows_5_0_0_tschat_test_15_1599059062: ClientVersion;
/** Windows 5.0.0-cobra-test-2, build 1599165810. */
export declare const Windows_5_0_0_cobra_test_2_1599165810: ClientVersion;
/** Windows 5.0.0-alpha400, build 1599165997. */
export declare const Windows_5_0_0_alpha400_1599165997: ClientVersion;
/** Windows 5.0.0-alpha401, build 1599486917. */
export declare const Windows_5_0_0_alpha401_1599486917: ClientVersion;
/** Windows 5.0.0-alpha402, build 1599557851. */
export declare const Windows_5_0_0_alpha402_1599557851: ClientVersion;
/** Windows 5.0.0-alpha403, build 1599578655. */
export declare const Windows_5_0_0_alpha403_1599578655: ClientVersion;
/** Windows 5.0.0-alpha404, build 1599669220. */
export declare const Windows_5_0_0_alpha404_1599669220: ClientVersion;
/** Android 3.5.0, build 1599755905. */
export declare const Android_3_5_0_1599755905: ClientVersion;
/** Windows 5.0.0-cobra-test-3, build 1599769084. */
export declare const Windows_5_0_0_cobra_test_3_1599769084: ClientVersion;
/** Windows 5.0.0-54c87064a, build 1599843538. */
export declare const Windows_5_0_0_54c87064a_1599843538: ClientVersion;
/** Windows 5.0.0-alpha406, build 1599846284. */
export declare const Windows_5_0_0_alpha406_1599846284: ClientVersion;
/** Windows 5.0.0-cobra-test-4, build 1599917420. */
export declare const Windows_5_0_0_cobra_test_4_1599917420: ClientVersion;
/** Windows 5.0.0-alpha407, build 1600159955. */
export declare const Windows_5_0_0_alpha407_1600159955: ClientVersion;
/** Windows 5.0.0-alpha408, build 1600254224. */
export declare const Windows_5_0_0_alpha408_1600254224: ClientVersion;
/** Windows 5.0.0-updater-test-8, build 1600284324. */
export declare const Windows_5_0_0_updater_test_8_1600284324: ClientVersion;
/** Windows 5.0.0-alpha409, build 1600339559. */
export declare const Windows_5_0_0_alpha409_1600339559: ClientVersion;
/** Windows 5.0.0-alpha410, build 1600365598. */
export declare const Windows_5_0_0_alpha410_1600365598: ClientVersion;
/** Android 3.5.0, build 1600439598. */
export declare const Android_3_5_0_1600439598: ClientVersion;
/** Windows 5.0.0-alpha411, build 1600469361. */
export declare const Windows_5_0_0_alpha411_1600469361: ClientVersion;
/** macOS 5.0.0-alpha411, build 1600469361. */
export declare const macOS_5_0_0_alpha411_1600469361: ClientVersion;
/** Windows 5.0.0-alpha412, build 1600599064. */
export declare const Windows_5_0_0_alpha412_1600599064: ClientVersion;
/** Windows 5.0.0-beta26-rc1, build 1600686231. */
export declare const Windows_5_0_0_beta26_rc1_1600686231: ClientVersion;
/** macOS 5.0.0-beta26-rc1, build 1600686231. */
export declare const macOS_5_0_0_beta26_rc1_1600686231: ClientVersion;
/** Windows 5.0.0-beta26-rc2, build 1600787359. */
export declare const Windows_5_0_0_beta26_rc2_1600787359: ClientVersion;
/** Windows 5.0.0-beta26-rc3, build 1600861922. */
export declare const Windows_5_0_0_beta26_rc3_1600861922: ClientVersion;
/** Windows 5.0.0-beta26-rc4, build 1600948191. */
export declare const Windows_5_0_0_beta26_rc4_1600948191: ClientVersion;
/** macOS 5.0.0-beta26-rc4, build 1600948191. */
export declare const macOS_5_0_0_beta26_rc4_1600948191: ClientVersion;
/** Windows 5.0.0-beta26-rc5, build 1601022865. */
export declare const Windows_5_0_0_beta26_rc5_1601022865: ClientVersion;
/** macOS 5.0.0-beta26-rc5, build 1601022865. */
export declare const macOS_5_0_0_beta26_rc5_1601022865: ClientVersion;
/** Windows 5.0.0-beta26-rc6, build 1601285793. */
export declare const Windows_5_0_0_beta26_rc6_1601285793: ClientVersion;
/** macOS 5.0.0-beta26-rc6, build 1601285793. */
export declare const macOS_5_0_0_beta26_rc6_1601285793: ClientVersion;
/** Windows 5.0.0-beta26-rc7, build 1601384917. */
export declare const Windows_5_0_0_beta26_rc7_1601384917: ClientVersion;
/** Windows 5.0.0-beta26-rc8, build 1601393829. */
export declare const Windows_5_0_0_beta26_rc8_1601393829: ClientVersion;
/** Windows 5.0.0-beta26, build 1601452077. */
export declare const Windows_5_0_0_beta26_1601452077: ClientVersion;
/** Windows 5.0.0-beta26, build 1601476259. */
export declare const Windows_5_0_0_beta26_1601476259: ClientVersion;
/** Linux 5.0.0-beta26, build 1601476259. */
export declare const Linux_5_0_0_beta26_1601476259: ClientVersion;
/** macOS 5.0.0-beta26, build 1601476259. */
export declare const macOS_5_0_0_beta26_1601476259: ClientVersion;
/** Windows 5.0.0-cobra-test-5, build 1601543268. */
export declare const Windows_5_0_0_cobra_test_5_1601543268: ClientVersion;
/** Windows 5.0.0-cobra-test-6, build 1601558370. */
export declare const Windows_5_0_0_cobra_test_6_1601558370: ClientVersion;
/** Windows 5.0.0-beta27-rc1, build 1601630484. */
export declare const Windows_5_0_0_beta27_rc1_1601630484: ClientVersion;
/** macOS 5.0.0-beta27-rc1, build 1601630484. */
export declare const macOS_5_0_0_beta27_rc1_1601630484: ClientVersion;
/** Windows 5.0.0-beta27-rc2, build 1601922246. */
export declare const Windows_5_0_0_beta27_rc2_1601922246: ClientVersion;
/** Windows 5.0.0-beta27-rc3, build 1601985868. */
export declare const Windows_5_0_0_beta27_rc3_1601985868: ClientVersion;
/** Windows 5.0.0-beta27, build 1601995137. */
export declare const Windows_5_0_0_beta27_1601995137: ClientVersion;
/** Linux 5.0.0-beta27, build 1601995137. */
export declare const Linux_5_0_0_beta27_1601995137: ClientVersion;
/** macOS 5.0.0-beta27, build 1601995137. */
export declare const macOS_5_0_0_beta27_1601995137: ClientVersion;
/** Windows 5.0.0-cobra-test-7, build 1602056579. */
export declare const Windows_5_0_0_cobra_test_7_1602056579: ClientVersion;
/** Windows 5.0.0-cobra-test-10, build 1602071823. */
export declare const Windows_5_0_0_cobra_test_10_1602071823: ClientVersion;
/** Windows 5.0.0-cobra-test-11, build 1602168387. */
export declare const Windows_5_0_0_cobra_test_11_1602168387: ClientVersion;
/** Windows 5.0.0-beta28-rc1, build 1602250328. */
export declare const Windows_5_0_0_beta28_rc1_1602250328: ClientVersion;
/** macOS 5.0.0-beta28-rc1, build 1602250328. */
export declare const macOS_5_0_0_beta28_rc1_1602250328: ClientVersion;
/** Android 3.5.0, build 1602492685. */
export declare const Android_3_5_0_1602492685: ClientVersion;
/** Windows 5.0.0-beta28-rc2, build 1602580552. */
export declare const Windows_5_0_0_beta28_rc2_1602580552: ClientVersion;
/** macOS 5.0.0-beta28-rc2, build 1602580552. */
export declare const macOS_5_0_0_beta28_rc2_1602580552: ClientVersion;
/** Windows 5.0.0-beta28, build 1602660382. */
export declare const Windows_5_0_0_beta28_1602660382: ClientVersion;
/** Linux 5.0.0-beta28, build 1602660382. */
export declare const Linux_5_0_0_beta28_1602660382: ClientVersion;
/** macOS 5.0.0-beta28, build 1602660382. */
export declare const macOS_5_0_0_beta28_1602660382: ClientVersion;
/** Windows 5.0.0-beta29-rc1, build 1602672104. */
export declare const Windows_5_0_0_beta29_rc1_1602672104: ClientVersion;
/** macOS 5.0.0-beta29-rc2, build 1602840532. */
export declare const macOS_5_0_0_beta29_rc2_1602840532: ClientVersion;
/** Windows 5.0.0-beta29-rc3, build 1603115757. */
export declare const Windows_5_0_0_beta29_rc3_1603115757: ClientVersion;
/** Windows 5.0.0-beta29, build 1603199536. */
export declare const Windows_5_0_0_beta29_1603199536: ClientVersion;
/** macOS 5.0.0-beta29, build 1603199536. */
export declare const macOS_5_0_0_beta29_1603199536: ClientVersion;
/** Windows 5.0.0-beta29.1, build 1603277784. */
export declare const Windows_5_0_0_beta29_1_1603277784: ClientVersion;
/** Linux 5.0.0-beta29.1, build 1603277784. */
export declare const Linux_5_0_0_beta29_1_1603277784: ClientVersion;
/** macOS 5.0.0-beta29.1, build 1603277784. */
export declare const macOS_5_0_0_beta29_1_1603277784: ClientVersion;
/** Windows 5.0.0-beta30-rc1, build 1603375915. */
export declare const Windows_5_0_0_beta30_rc1_1603375915: ClientVersion;
/** macOS 5.0.0-beta30-rc1, build 1603375915. */
export declare const macOS_5_0_0_beta30_rc1_1603375915: ClientVersion;
/** Windows 5.0.0-beta30-rc2, build 1603714412. */
export declare const Windows_5_0_0_beta30_rc2_1603714412: ClientVersion;
/** Windows 5.0.0-beta30-rc3, build 1603793389. */
export declare const Windows_5_0_0_beta30_rc3_1603793389: ClientVersion;
/** Windows 5.0.0-beta30, build 1603882166. */
export declare const Windows_5_0_0_beta30_1603882166: ClientVersion;
/** Linux 5.0.0-beta30, build 1603882166. */
export declare const Linux_5_0_0_beta30_1603882166: ClientVersion;
/** macOS 5.0.0-beta30, build 1603882166. */
export declare const macOS_5_0_0_beta30_1603882166: ClientVersion;
/** Windows 5.0.0-internal-1, build 1603899622. */
export declare const Windows_5_0_0_internal_1_1603899622: ClientVersion;
/** Windows 3.5.5, build 1604062410. */
export declare const Windows_3_5_5_1604062410: ClientVersion;
/** Windows 5.0.0-beta31-rc1, build 1604069291. */
export declare const Windows_5_0_0_beta31_rc1_1604069291: ClientVersion;
/** Windows 5.0.0-beta31-rc2, build 1604331167. */
export declare const Windows_5_0_0_beta31_rc2_1604331167: ClientVersion;
/** Windows 5.0.0-beta31, build 1604481627. */
export declare const Windows_5_0_0_beta31_1604481627: ClientVersion;
/** Linux 5.0.0-beta31, build 1604481627. */
export declare const Linux_5_0_0_beta31_1604481627: ClientVersion;
/** macOS 5.0.0-beta31, build 1604481627. */
export declare const macOS_5_0_0_beta31_1604481627: ClientVersion;
/** Windows 3.5.5, build 1604483867. */
export declare const Windows_3_5_5_1604483867: ClientVersion;
/** Linux 3.5.5, build 1604483867. */
export declare const Linux_3_5_5_1604483867: ClientVersion;
/** OS X 3.5.5, build 1604483867. */
export declare const OSX_3_5_5_1604483867: ClientVersion;
/** Windows 5.0.0-beta32-rc1, build 1604501880. */
export declare const Windows_5_0_0_beta32_rc1_1604501880: ClientVersion;
/** Windows 5.0.0-beta32-rc2, build 1604657081. */
export declare const Windows_5_0_0_beta32_rc2_1604657081: ClientVersion;
/** macOS 5.0.0-beta32-rc2, build 1604657081. */
export declare const macOS_5_0_0_beta32_rc2_1604657081: ClientVersion;
/** macOS 5.0.0-beta32-rc3, build 1604936365. */
export declare const macOS_5_0_0_beta32_rc3_1604936365: ClientVersion;
/** Windows 5.0.0-beta32-rc4, build 1605002654. */
export declare const Windows_5_0_0_beta32_rc4_1605002654: ClientVersion;
/** Windows 5.0.0-beta32-rc5, build 1605018568. */
export declare const Windows_5_0_0_beta32_rc5_1605018568: ClientVersion;
/** Windows 5.0.0-beta32, build 1605097383. */
export declare const Windows_5_0_0_beta32_1605097383: ClientVersion;
/** Linux 5.0.0-beta32, build 1605097383. */
export declare const Linux_5_0_0_beta32_1605097383: ClientVersion;
/** macOS 5.0.0-beta32, build 1605097383. */
export declare const macOS_5_0_0_beta32_1605097383: ClientVersion;
/** Windows 5.0.0-bab0e5e53, build 1605109329. */
export declare const Windows_5_0_0_bab0e5e53_1605109329: ClientVersion;
/** iOS 3.5.6, build 1605182235. */
export declare const iOS_3_5_6_1605182235: ClientVersion;
/** Windows 5.0.0-cobra-testing-11, build 1605194844. */
export declare const Windows_5_0_0_cobra_testing_11_1605194844: ClientVersion;
/** Windows 5.0.0-beta33-rc1, build 1605268533. */
export declare const Windows_5_0_0_beta33_rc1_1605268533: ClientVersion;
/** macOS 5.0.0-beta33-rc1, build 1605268533. */
export declare const macOS_5_0_0_beta33_rc1_1605268533: ClientVersion;
/** macOS 5.0.0-test-icons, build 1605393546. */
export declare const macOS_5_0_0_test_icons_1605393546: ClientVersion;
/** Android 3.5.0, build 1605605389. */
export declare const Android_3_5_0_1605605389: ClientVersion;
/** macOS 5.0.0-beta33-rc2, build 1605608215. */
export declare const macOS_5_0_0_beta33_rc2_1605608215: ClientVersion;
/** Windows 5.0.0-beta33-rc2, build 1605675336. */
export declare const Windows_5_0_0_beta33_rc2_1605675336: ClientVersion;
/** Windows 5.0.0-beta33, build 1605693829. */
export declare const Windows_5_0_0_beta33_1605693829: ClientVersion;
/** Linux 5.0.0-beta33, build 1605693829. */
export declare const Linux_5_0_0_beta33_1605693829: ClientVersion;
/** Windows 5.0.0-alpha414, build 1605720501. */
export declare const Windows_5_0_0_alpha414_1605720501: ClientVersion;
/** Windows 5.0.0-new_certificate_test-2, build 1605794034. */
export declare const Windows_5_0_0_new_certificate_test_2_1605794034: ClientVersion;
/** Windows 5.0.0-prev416, build 1605888535. */
export declare const Windows_5_0_0_prev416_1605888535: ClientVersion;
/** Windows 3.5.6, build 1606093423. */
export declare const Windows_3_5_6_1606093423: ClientVersion;
/** Windows 5.0.0-beta34-rc1, build 1606209261. */
export declare const Windows_5_0_0_beta34_rc1_1606209261: ClientVersion;
/** Windows 5.0.0-beta34-rc1, build 1606232731. */
export declare const Windows_5_0_0_beta34_rc1_1606232731: ClientVersion;
/** Windows 5.0.0-beta34-rc2, build 1606259476. */
export declare const Windows_5_0_0_beta34_rc2_1606259476: ClientVersion;
/** Windows 5.0.0-beta34-rc2, build 1606303040. */
export declare const Windows_5_0_0_beta34_rc2_1606303040: ClientVersion;
/** Windows 5.0.0-beta34, build 1606310756. */
export declare const Windows_5_0_0_beta34_1606310756: ClientVersion;
/** Linux 5.0.0-beta34, build 1606310756. */
export declare const Linux_5_0_0_beta34_1606310756: ClientVersion;
/** macOS 5.0.0-beta34, build 1606310756. */
export declare const macOS_5_0_0_beta34_1606310756: ClientVersion;
/** Windows 3.5.6, build 1606312422. */
export declare const Windows_3_5_6_1606312422: ClientVersion;
/** Linux 3.5.6, build 1606312422. */
export declare const Linux_3_5_6_1606312422: ClientVersion;
/** OS X 3.5.6, build 1606312422. */
export declare const OSX_3_5_6_1606312422: ClientVersion;
/** Windows 5.0.0-qa-1, build 1606395781. */
export declare const Windows_5_0_0_qa_1_1606395781: ClientVersion;
/** Windows 3.5.7, build 1606519399. */
export declare const Windows_3_5_7_1606519399: ClientVersion;
/** Windows 3.5.7, build 1606578603. */
export declare const Windows_3_5_7_1606578603: ClientVersion;
/** Windows 5.0.0-beta35-rc1, build 1606766504. */
export declare const Windows_5_0_0_beta35_rc1_1606766504: ClientVersion;
/** Linux 5.0.0-beta35-rc1, build 1606766504. */
export declare const Linux_5_0_0_beta35_rc1_1606766504: ClientVersion;
/** Windows 5.0.0-beta35-rc2, build 1606832721. */
export declare const Windows_5_0_0_beta35_rc2_1606832721: ClientVersion;
/** Windows 5.0.0-beta35, build 1606908024. */
export declare const Windows_5_0_0_beta35_1606908024: ClientVersion;
/** Linux 5.0.0-beta35, build 1606908024. */
export declare const Linux_5_0_0_beta35_1606908024: ClientVersion;
/** macOS 5.0.0-beta35, build 1606908024. */
export declare const macOS_5_0_0_beta35_1606908024: ClientVersion;
/** Windows 5.0.0-cobra-testing-12, build 1607080844. */
export declare const Windows_5_0_0_cobra_testing_12_1607080844: ClientVersion;
/** Windows 5.0.0-beta36-rc1, build 1607093951. */
export declare const Windows_5_0_0_beta36_rc1_1607093951: ClientVersion;
/** macOS 5.0.0-beta36-rc1, build 1607093951. */
export declare const macOS_5_0_0_beta36_rc1_1607093951: ClientVersion;
/** Windows 5.0.0-beta36-rc3, build 1607430517. */
export declare const Windows_5_0_0_beta36_rc3_1607430517: ClientVersion;
/** Linux 5.0.0-beta36-rc3, build 1607430517. */
export declare const Linux_5_0_0_beta36_rc3_1607430517: ClientVersion;
/** Windows 3.5.7, build 1607443312. */
export declare const Windows_3_5_7_1607443312: ClientVersion;
/** Linux 3.5.7, build 1607443312. */
export declare const Linux_3_5_7_1607443312: ClientVersion;
/** Windows 5.0.0-beta36-rc4, build 1607500856. */
export declare const Windows_5_0_0_beta36_rc4_1607500856: ClientVersion;
/** Windows 5.0.0-beta36, build 1607523167. */
export declare const Windows_5_0_0_beta36_1607523167: ClientVersion;
/** Linux 5.0.0-beta36, build 1607523167. */
export declare const Linux_5_0_0_beta36_1607523167: ClientVersion;
/** macOS 5.0.0-beta36, build 1607523167. */
export declare const macOS_5_0_0_beta36_1607523167: ClientVersion;
/** Windows 5.0.0-qa-4, build 1607596631. */
export declare const Windows_5_0_0_qa_4_1607596631: ClientVersion;
/** Windows 5.0.0-cobra-testing-14, build 1607689476. */
export declare const Windows_5_0_0_cobra_testing_14_1607689476: ClientVersion;
/** Windows 5.0.0-beta36.1-rc1, build 1607948316. */
export declare const Windows_5_0_0_beta36_1_rc1_1607948316: ClientVersion;
/** Windows 5.0.0-beta36.1, build 1608110690. */
export declare const Windows_5_0_0_beta36_1_1608110690: ClientVersion;
/** Linux 5.0.0-beta36.1, build 1608110690. */
export declare const Linux_5_0_0_beta36_1_1608110690: ClientVersion;
/** macOS 5.0.0-beta36.1, build 1608110690. */
export declare const macOS_5_0_0_beta36_1_1608110690: ClientVersion;
/** Windows 5.0.0-qa-8, build 1608135862. */
export declare const Windows_5_0_0_qa_8_1608135862: ClientVersion;
/** Windows 5.0.0-cobra-testing-15, build 1608206477. */
export declare const Windows_5_0_0_cobra_testing_15_1608206477: ClientVersion;
/** Windows 3.5.7, build 1608224421. */
export declare const Windows_3_5_7_1608224421: ClientVersion;
/** Linux 3.5.7, build 1608224421. */
export declare const Linux_3_5_7_1608224421: ClientVersion;
/** OS X 3.5.7, build 1608224421. */
export declare const OSX_3_5_7_1608224421: ClientVersion;
/** Windows 5.0.0-qa-12, build 1608565516. */
export declare const Windows_5_0_0_qa_12_1608565516: ClientVersion;
/** Windows 5.0.0-qa-13, build 1608646134. */
export declare const Windows_5_0_0_qa_13_1608646134: ClientVersion;
/** Windows 5.0.0-cobra-testing-16, build 1608713116. */
export declare const Windows_5_0_0_cobra_testing_16_1608713116: ClientVersion;
/** Windows 5.0.0-qa-16, build 1610030909. */
export declare const Windows_5_0_0_qa_16_1610030909: ClientVersion;
/** Windows 3.5.7, build 1610311072. */
export declare const Windows_3_5_7_1610311072: ClientVersion;
/** Linux 3.5.7, build 1610311072. */
export declare const Linux_3_5_7_1610311072: ClientVersion;
/** Windows 5.0.0-beta37-rc1, build 1610378934. */
export declare const Windows_5_0_0_beta37_rc1_1610378934: ClientVersion;
/** Windows 5.0.0-beta37-rc2, build 1610414299. */
export declare const Windows_5_0_0_beta37_rc2_1610414299: ClientVersion;
/** Windows 5.0.0-beta37, build 1610450631. */
export declare const Windows_5_0_0_beta37_1610450631: ClientVersion;
/** Linux 5.0.0-beta37, build 1610450631. */
export declare const Linux_5_0_0_beta37_1610450631: ClientVersion;
/** macOS 5.0.0-beta37, build 1610450631. */
export declare const macOS_5_0_0_beta37_1610450631: ClientVersion;
/** Windows 5.0.0-beta38-rc1, build 1610453987. */
export declare const Windows_5_0_0_beta38_rc1_1610453987: ClientVersion;
/** Windows 5.0.0-qa-18, build 1610541782. */
export declare const Windows_5_0_0_qa_18_1610541782: ClientVersion;
/** Windows 5.0.0-cobra-testing-17, build 1610555339. */
export declare const Windows_5_0_0_cobra_testing_17_1610555339: ClientVersion;
/** Windows 5.0.0-cobra-testing-18, build 1610623794. */
export declare const Windows_5_0_0_cobra_testing_18_1610623794: ClientVersion;
/** Windows 5.0.0-cobra-testing-19, build 1610706840. */
export declare const Windows_5_0_0_cobra_testing_19_1610706840: ClientVersion;
/** Windows 5.0.0-qa-19, build 1610957172. */
export declare const Windows_5_0_0_qa_19_1610957172: ClientVersion;
/** Windows 5.0.0-qa-20, build 1610968143. */
export declare const Windows_5_0_0_qa_20_1610968143: ClientVersion;
/** Windows 5.0.0-beta38-rc2, build 1611137742. */
export declare const Windows_5_0_0_beta38_rc2_1611137742: ClientVersion;
/** Windows 5.0.0-cobra-testing-20, build 1611147479. */
export declare const Windows_5_0_0_cobra_testing_20_1611147479: ClientVersion;
/** Windows 5.0.0-beta38-rc3, build 1611148781. */
export declare const Windows_5_0_0_beta38_rc3_1611148781: ClientVersion;
/** Windows 5.0.0-beta38, build 1611230438. */
export declare const Windows_5_0_0_beta38_1611230438: ClientVersion;
/** Linux 5.0.0-beta38, build 1611230438. */
export declare const Linux_5_0_0_beta38_1611230438: ClientVersion;
/** macOS 5.0.0-beta38, build 1611230438. */
export declare const macOS_5_0_0_beta38_1611230438: ClientVersion;
/** Windows 5.0.0-qa-21, build 1611242317. */
export declare const Windows_5_0_0_qa_21_1611242317: ClientVersion;
/** Windows 5.0.0-qa-23, build 1611337907. */
export declare const Windows_5_0_0_qa_23_1611337907: ClientVersion;
/** Windows 5.0.0-qa-24, build 1611589480. */
export declare const Windows_5_0_0_qa_24_1611589480: ClientVersion;
/** Windows 5.0.0-qa-25, build 1611659620. */
export declare const Windows_5_0_0_qa_25_1611659620: ClientVersion;
/** Windows 5.0.0-beta39-rc1, build 1611678252. */
export declare const Windows_5_0_0_beta39_rc1_1611678252: ClientVersion;
/** Windows 5.0.0-beta39, build 1611686251. */
export declare const Windows_5_0_0_beta39_1611686251: ClientVersion;
/** Linux 5.0.0-beta39, build 1611686251. */
export declare const Linux_5_0_0_beta39_1611686251: ClientVersion;
/** macOS 5.0.0-beta39, build 1611686251. */
export declare const macOS_5_0_0_beta39_1611686251: ClientVersion;
/** Windows 5.0.0-qa-26, build 1611743375. */
export declare const Windows_5_0_0_qa_26_1611743375: ClientVersion;
/** Windows 5.0.0-beta40-rc1, build 1611825049. */
export declare const Windows_5_0_0_beta40_rc1_1611825049: ClientVersion;
/** macOS 5.0.0-beta40-rc1, build 1611825049. */
export declare const macOS_5_0_0_beta40_rc1_1611825049: ClientVersion;
/** Windows 5.0.0-cobra-testing-21, build 1611838875. */
export declare const Windows_5_0_0_cobra_testing_21_1611838875: ClientVersion;
/** Windows 5.0.0-special-build, build 1611839196. */
export declare const Windows_5_0_0_special_build_1611839196: ClientVersion;
/** Windows 5.0.0-pin-msg-redesign-8, build 1611846460. */
export declare const Windows_5_0_0_pin_msg_redesign_8_1611846460: ClientVersion;
/** Windows 5.0.0-beta40-rc2, build 1611855045. */
export declare const Windows_5_0_0_beta40_rc2_1611855045: ClientVersion;
/** Windows 5.0.0-beta40-rc3, build 1612189982. */
export declare const Windows_5_0_0_beta40_rc3_1612189982: ClientVersion;
/** Windows 5.0.0-ava-4, build 1612264282. */
export declare const Windows_5_0_0_ava_4_1612264282: ClientVersion;
/** Windows 5.0.0-beta40-rc5, build 1612288104. */
export declare const Windows_5_0_0_beta40_rc5_1612288104: ClientVersion;
/** Windows 5.0.0-beta40, build 1612346973. */
export declare const Windows_5_0_0_beta40_1612346973: ClientVersion;
/** macOS 5.0.0-beta40, build 1612346973. */
export declare const macOS_5_0_0_beta40_1612346973: ClientVersion;
/** Windows 5.0.0-qa-29, build 1612453131. */
export declare const Windows_5_0_0_qa_29_1612453131: ClientVersion;
/** Windows 5.0.0-beta41-rc1, build 1612527693. */
export declare const Windows_5_0_0_beta41_rc1_1612527693: ClientVersion;
/** Windows 5.0.0-beta41-rc2, build 1612782198. */
export declare const Windows_5_0_0_beta41_rc2_1612782198: ClientVersion;
/** Windows 3.5.7, build 1612783432. */
export declare const Windows_3_5_7_1612783432: ClientVersion;
/** Windows 5.0.0-beta41-rc3, build 1612799472. */
export declare const Windows_5_0_0_beta41_rc3_1612799472: ClientVersion;
/** Windows 5.0.0-beta41-rc4, build 1612811479. */
export declare const Windows_5_0_0_beta41_rc4_1612811479: ClientVersion;
/** Windows 5.0.0-qa-33, build 1612983552. */
export declare const Windows_5_0_0_qa_33_1612983552: ClientVersion;
/** Windows 5.0.0-beta41, build 1613053158. */
export declare const Windows_5_0_0_beta41_1613053158: ClientVersion;
/** Windows 5.0.0-pin-msg-redesign-9, build 1613057624. */
export declare const Windows_5_0_0_pin_msg_redesign_9_1613057624: ClientVersion;
/** Windows 5.0.0-beta41.1-rc2, build 1613065465. */
export declare const Windows_5_0_0_beta41_1_rc2_1613065465: ClientVersion;
/** Windows 3.5.7, build 1613066709. */
export declare const Windows_3_5_7_1613066709: ClientVersion;
/** OS X 3.5.7, build 1613066709. */
export declare const OSX_3_5_7_1613066709: ClientVersion;
/** Windows 5.0.0-beta41.1, build 1613126021. */
export declare const Windows_5_0_0_beta41_1_1613126021: ClientVersion;
/** Linux 5.0.0-beta41.1, build 1613126021. */
export declare const Linux_5_0_0_beta41_1_1613126021: ClientVersion;
/** macOS 5.0.0-beta41.1, build 1613126021. */
export declare const macOS_5_0_0_beta41_1_1613126021: ClientVersion;
/** Windows 5.0.0-qa-37, build 1613394573. */
export declare const Windows_5_0_0_qa_37_1613394573: ClientVersion;
/** Windows 5.0.0-qa-38, build 1613482789. */
export declare const Windows_5_0_0_qa_38_1613482789: ClientVersion;
/** Windows 5.0.0-beta42-rc1, build 1613498559. */
export declare const Windows_5_0_0_beta42_rc1_1613498559: ClientVersion;
/** Windows 5.0.0-qa-50, build 1613574228. */
export declare const Windows_5_0_0_qa_50_1613574228: ClientVersion;
/** Windows 5.0.0-beta42-rc2, build 1613574920. */
export declare const Windows_5_0_0_beta42_rc2_1613574920: ClientVersion;
/** Windows 5.0.0-beta42, build 1613641112. */
export declare const Windows_5_0_0_beta42_1613641112: ClientVersion;
/** Linux 5.0.0-beta42, build 1613641112. */
export declare const Linux_5_0_0_beta42_1613641112: ClientVersion;
/** macOS 5.0.0-beta42, build 1613641112. */
export declare const macOS_5_0_0_beta42_1613641112: ClientVersion;
/** Windows 5.0.0-whip-6, build 1613731286. */
export declare const Windows_5_0_0_whip_6_1613731286: ClientVersion;
/** Windows 5.0.0-beta43-rc1, build 1613737602. */
export declare const Windows_5_0_0_beta43_rc1_1613737602: ClientVersion;
/** Windows 5.0.0-beta43-rc2, build 1614094754. */
export declare const Windows_5_0_0_beta43_rc2_1614094754: ClientVersion;
/** Windows 5.0.0-beta43, build 1614165699. */
export declare const Windows_5_0_0_beta43_1614165699: ClientVersion;
/** Windows 5.0.0-beta43, build 1614246086. */
export declare const Windows_5_0_0_beta43_1614246086: ClientVersion;
/** Linux 5.0.0-beta43, build 1614246086. */
export declare const Linux_5_0_0_beta43_1614246086: ClientVersion;
/** macOS 5.0.0-beta43, build 1614246086. */
export declare const macOS_5_0_0_beta43_1614246086: ClientVersion;
/** Windows 5.0.0-beta44-rc1, build 1614332025. */
export declare const Windows_5_0_0_beta44_rc1_1614332025: ClientVersion;
/** Windows 5.0.0-beta44-rc2, build 1614595863. */
export declare const Windows_5_0_0_beta44_rc2_1614595863: ClientVersion;
/** Linux 5.0.0-beta44-rc2, build 1614595863. */
export declare const Linux_5_0_0_beta44_rc2_1614595863: ClientVersion;
/** Windows 5.0.0-beta44-rc3, build 1614674773. */
export declare const Windows_5_0_0_beta44_rc3_1614674773: ClientVersion;
/** Windows 5.0.0-whip-7, build 1614690487. */
export declare const Windows_5_0_0_whip_7_1614690487: ClientVersion;
/** Windows 5.0.0-beta44-rc7, build 1614789085. */
export declare const Windows_5_0_0_beta44_rc7_1614789085: ClientVersion;
/** Windows 5.0.0-beta44, build 1614848974. */
export declare const Windows_5_0_0_beta44_1614848974: ClientVersion;
/** Linux 5.0.0-beta44, build 1614848974. */
export declare const Linux_5_0_0_beta44_1614848974: ClientVersion;
/** macOS 5.0.0-beta44, build 1614848974. */
export declare const macOS_5_0_0_beta44_1614848974: ClientVersion;
/** Windows 5.0.0-whip-9, build 1614852852. */
export declare const Windows_5_0_0_whip_9_1614852852: ClientVersion;
/** Windows 5.0.0-whip-10, build 1614865959. */
export declare const Windows_5_0_0_whip_10_1614865959: ClientVersion;
/** Windows 5.0.0-beta45-rc1, build 1614934599. */
export declare const Windows_5_0_0_beta45_rc1_1614934599: ClientVersion;
/** OS X 3.5.7, build 1614951001. */
export declare const OSX_3_5_7_1614951001: ClientVersion;
/** Windows 5.0.0-beta45-rc2, build 1614959212. */
export declare const Windows_5_0_0_beta45_rc2_1614959212: ClientVersion;
/** Windows 5.0.0-beta45-rc3, build 1615238124. */
export declare const Windows_5_0_0_beta45_rc3_1615238124: ClientVersion;
/** Windows 5.0.0-beta45, build 1615368890. */
export declare const Windows_5_0_0_beta45_1615368890: ClientVersion;
/** Linux 5.0.0-beta45, build 1615368890. */
export declare const Linux_5_0_0_beta45_1615368890: ClientVersion;
/** Windows 5.0.0-beta45.1, build 1615384896. */
export declare const Windows_5_0_0_beta45_1_1615384896: ClientVersion;
/** macOS 5.0.0-beta45.1, build 1615384896. */
export declare const macOS_5_0_0_beta45_1_1615384896: ClientVersion;
/** Windows 5.0.0-beta45.2, build 1615454854. */
export declare const Windows_5_0_0_beta45_2_1615454854: ClientVersion;
/** Linux 5.0.0-beta45.2, build 1615454854. */
export declare const Linux_5_0_0_beta45_2_1615454854: ClientVersion;
/** macOS 5.0.0-beta45.2, build 1615454854. */
export declare const macOS_5_0_0_beta45_2_1615454854: ClientVersion;
/** Windows 5.0.0-beta46-rc1, build 1615454969. */
export declare const Windows_5_0_0_beta46_rc1_1615454969: ClientVersion;
/** Windows 5.0.0-beta46-rc2, build 1615547095. */
export declare const Windows_5_0_0_beta46_rc2_1615547095: ClientVersion;
/** Windows 5.0.0-beta46-rc3, build 1615974917. */
export declare const Windows_5_0_0_beta46_rc3_1615974917: ClientVersion;
/** Windows 5.0.0-cobra-testing-30, build 1615991576. */
export declare const Windows_5_0_0_cobra_testing_30_1615991576: ClientVersion;
/** Windows 5.0.0-beta46, build 1616059671. */
export declare const Windows_5_0_0_beta46_1616059671: ClientVersion;
/** Linux 5.0.0-beta46, build 1616059671. */
export declare const Linux_5_0_0_beta46_1616059671: ClientVersion;
/** macOS 5.0.0-beta46, build 1616059671. */
export declare const macOS_5_0_0_beta46_1616059671: ClientVersion;
/** Windows 5.0.0-beta47-rc1, build 1616085242. */
export declare const Windows_5_0_0_beta47_rc1_1616085242: ClientVersion;
/** Windows 5.0.0-beta47-rc2, build 1616094254. */
export declare const Windows_5_0_0_beta47_rc2_1616094254: ClientVersion;
/** Windows 5.0.0-co-1, build 1616188878. */
export declare const Windows_5_0_0_co_1_1616188878: ClientVersion;
/** Windows 5.0.0-beta47-rc3, build 1616533310. */
export declare const Windows_5_0_0_beta47_rc3_1616533310: ClientVersion;
/** Windows 5.0.0-beta47-rc4, build 1616586931. */
export declare const Windows_5_0_0_beta47_rc4_1616586931: ClientVersion;
/** Windows 5.0.0-beta47, build 1616598274. */
export declare const Windows_5_0_0_beta47_1616598274: ClientVersion;
/** Linux 5.0.0-beta47, build 1616598274. */
export declare const Linux_5_0_0_beta47_1616598274: ClientVersion;
/** macOS 5.0.0-beta47, build 1616598274. */
export declare const macOS_5_0_0_beta47_1616598274: ClientVersion;
/** Windows 5.0.0-qa-48-1, build 1616670396. */
export declare const Windows_5_0_0_qa_48_1_1616670396: ClientVersion;
/** Windows 5.0.0-beta48-rc1, build 1617015983. */
export declare const Windows_5_0_0_beta48_rc1_1617015983: ClientVersion;
/** Windows 5.0.0-beta48, build 1617183427. */
export declare const Windows_5_0_0_beta48_1617183427: ClientVersion;
/** Linux 5.0.0-beta48, build 1617183427. */
export declare const Linux_5_0_0_beta48_1617183427: ClientVersion;
/** macOS 5.0.0-beta48, build 1617183427. */
export declare const macOS_5_0_0_beta48_1617183427: ClientVersion;
/** Windows 5.0.0-beta49-rc1, build 1617889801. */
export declare const Windows_5_0_0_beta49_rc1_1617889801: ClientVersion;
/** Windows 5.0.0-ticket2000-2, build 1617892719. */
export declare const Windows_5_0_0_ticket2000_2_1617892719: ClientVersion;
/** Windows 5.0.0-beta49-rc2, build 1618219716. */
export declare const Windows_5_0_0_beta49_rc2_1618219716: ClientVersion;
/** Windows 5.0.0-ticket2000-3, build 1618230451. */
export declare const Windows_5_0_0_ticket2000_3_1618230451: ClientVersion;
/** Windows 5.0.0-t2000-4, build 1618303999. */
export declare const Windows_5_0_0_t2000_4_1618303999: ClientVersion;
/** Windows 5.0.0-beta49-rc3, build 1618310180. */
export declare const Windows_5_0_0_beta49_rc3_1618310180: ClientVersion;
/** Windows 5.0.0-qa-49-7, build 1618321773. */
export declare const Windows_5_0_0_qa_49_7_1618321773: ClientVersion;
/** Windows 5.0.0-beta49, build 1618401668. */
export declare const Windows_5_0_0_beta49_1618401668: ClientVersion;
/** Linux 5.0.0-beta49, build 1618401668. */
export declare const Linux_5_0_0_beta49_1618401668: ClientVersion;
/** macOS 5.0.0-beta49, build 1618401668. */
export declare const macOS_5_0_0_beta49_1618401668: ClientVersion;
/** Windows 5.0.0-shorturls-2, build 1618486773. */
export declare const Windows_5_0_0_shorturls_2_1618486773: ClientVersion;
/** Windows 5.0.0-beta50-rc2, build 1618505526. */
export declare const Windows_5_0_0_beta50_rc2_1618505526: ClientVersion;
/** macOS 5.0.0-beta50-rc3, build 1618776916. */
export declare const macOS_5_0_0_beta50_rc3_1618776916: ClientVersion;
/** Windows 5.0.0-beta50, build 1619006474. */
export declare const Windows_5_0_0_beta50_1619006474: ClientVersion;
/** Linux 5.0.0-beta50, build 1619006474. */
export declare const Linux_5_0_0_beta50_1619006474: ClientVersion;
/** macOS 5.0.0-beta50, build 1619006474. */
export declare const macOS_5_0_0_beta50_1619006474: ClientVersion;
/** Windows 5.0.0-qa-51-1, build 1619041054. */
export declare const Windows_5_0_0_qa_51_1_1619041054: ClientVersion;
/** Windows 5.0.0-beta51-rc1, build 1619190183. */
export declare const Windows_5_0_0_beta51_rc1_1619190183: ClientVersion;
/** Windows 5.0.0-beta51-rc2, build 1619364080. */
export declare const Windows_5_0_0_beta51_rc2_1619364080: ClientVersion;
/** Windows 5.0.0-beta51-rc4, build 1619371671. */
export declare const Windows_5_0_0_beta51_rc4_1619371671: ClientVersion;
/** Windows 5.0.0-beta51-rc4, build 1619462790. */
export declare const Windows_5_0_0_beta51_rc4_1619462790: ClientVersion;
/** Windows 5.0.0-beta51-rc5, build 1619624829. */
export declare const Windows_5_0_0_beta51_rc5_1619624829: ClientVersion;
/** Windows 5.0.0-beta51, build 1619681979. */
export declare const Windows_5_0_0_beta51_1619681979: ClientVersion;
/** Linux 5.0.0-beta51, build 1619681979. */
export declare const Linux_5_0_0_beta51_1619681979: ClientVersion;
/** macOS 5.0.0-beta51, build 1619681979. */
export declare const macOS_5_0_0_beta51_1619681979: ClientVersion;
/** Windows 5.0.0-qa-52-2, build 1619773339. */
export declare const Windows_5_0_0_qa_52_2_1619773339: ClientVersion;
/** Windows 5.0.0-qa-52-4, build 1619890509. */
export declare const Windows_5_0_0_qa_52_4_1619890509: ClientVersion;
/** Windows 5.0.0-beta52-rc1, build 1620060486. */
export declare const Windows_5_0_0_beta52_rc1_1620060486: ClientVersion;
/** Windows 5.0.0-qa-52-6, build 1620142606. */
export declare const Windows_5_0_0_qa_52_6_1620142606: ClientVersion;
/** Windows 5.0.0-beta52-rc2, build 1620215337. */
export declare const Windows_5_0_0_beta52_rc2_1620215337: ClientVersion;
/** Windows 5.0.0-beta52, build 1620308356. */
export declare const Windows_5_0_0_beta52_1620308356: ClientVersion;
/** Linux 5.0.0-beta52, build 1620308356. */
export declare const Linux_5_0_0_beta52_1620308356: ClientVersion;
/** macOS 5.0.0-beta52, build 1620308356. */
export declare const macOS_5_0_0_beta52_1620308356: ClientVersion;
/** Windows 5.0.0-beta52.1, build 1620389196. */
export declare const Windows_5_0_0_beta52_1_1620389196: ClientVersion;
/** Linux 5.0.0-beta52.1, build 1620389196. */
export declare const Linux_5_0_0_beta52_1_1620389196: ClientVersion;
/** macOS 5.0.0-beta52.1, build 1620389196. */
export declare const macOS_5_0_0_beta52_1_1620389196: ClientVersion;
/** Windows 5.0.0-beta53-rc1, build 1620391678. */
export declare const Windows_5_0_0_beta53_rc1_1620391678: ClientVersion;
/** Windows 5.0.0-qa-53-2, build 1620406854. */
export declare const Windows_5_0_0_qa_53_2_1620406854: ClientVersion;
/** Windows 5.0.0-qa-53-3, build 1620466424. */
export declare const Windows_5_0_0_qa_53_3_1620466424: ClientVersion;
/** Windows 5.0.0-beta53-rc3, build 1620751751. */
export declare const Windows_5_0_0_beta53_rc3_1620751751: ClientVersion;
/** Windows 5.0.0-beta53, build 1620812712. */
export declare const Windows_5_0_0_beta53_1620812712: ClientVersion;
/** Linux 5.0.0-beta53, build 1620812712. */
export declare const Linux_5_0_0_beta53_1620812712: ClientVersion;
/** macOS 5.0.0-beta53, build 1620812712. */
export declare const macOS_5_0_0_beta53_1620812712: ClientVersion;
/** Windows 5.0.0-qa-th-7, build 1620837606. */
export declare const Windows_5_0_0_qa_th_7_1620837606: ClientVersion;
/** Windows 5.0.0-beta54-rc1, build 1620990757. */
export declare const Windows_5_0_0_beta54_rc1_1620990757: ClientVersion;
/** Windows 5.0.0-qa-sea-3, build 1621467933. */
export declare const Windows_5_0_0_qa_sea_3_1621467933: ClientVersion;
/** Windows 5.0.0-beta54-rc2, build 1621608154. */
export declare const Windows_5_0_0_beta54_rc2_1621608154: ClientVersion;
/** Windows 5.0.0-qa-ex-1, build 1621780734. */
export declare const Windows_5_0_0_qa_ex_1_1621780734: ClientVersion;
/** Windows 5.0.0-beta54-rc3, build 1621966258. */
export declare const Windows_5_0_0_beta54_rc3_1621966258: ClientVersion;
/** macOS 5.0.0-beta54-rc3, build 1621966258. */
export declare const macOS_5_0_0_beta54_rc3_1621966258: ClientVersion;
/** Windows 5.0.0-beta54, build 1622118640. */
export declare const Windows_5_0_0_beta54_1622118640: ClientVersion;
/** Linux 5.0.0-beta54, build 1622118640. */
export declare const Linux_5_0_0_beta54_1622118640: ClientVersion;
/** macOS 5.0.0-beta54, build 1622118640. */
export declare const macOS_5_0_0_beta54_1622118640: ClientVersion;
/** Windows 5.0.0-qa-55-1, build 1622144487. */
export declare const Windows_5_0_0_qa_55_1_1622144487: ClientVersion;
/** Windows 5.0.0-beta54.1, build 1622193586. */
export declare const Windows_5_0_0_beta54_1_1622193586: ClientVersion;
/** Linux 5.0.0-beta54.1, build 1622193586. */
export declare const Linux_5_0_0_beta54_1_1622193586: ClientVersion;
/** macOS 5.0.0-beta54.1, build 1622193586. */
export declare const macOS_5_0_0_beta54_1_1622193586: ClientVersion;
/** Windows 5.0.0-beta55-rc1, build 1622211570. */
export declare const Windows_5_0_0_beta55_rc1_1622211570: ClientVersion;
/** Windows 5.0.0-beta55-rc3, build 1622558414. */
export declare const Windows_5_0_0_beta55_rc3_1622558414: ClientVersion;
/** Windows 5.0.0-beta55, build 1622638893. */
export declare const Windows_5_0_0_beta55_1622638893: ClientVersion;
/** Linux 5.0.0-beta55, build 1622638893. */
export declare const Linux_5_0_0_beta55_1622638893: ClientVersion;
/** macOS 5.0.0-beta55, build 1622638893. */
export declare const macOS_5_0_0_beta55_1622638893: ClientVersion;
/** Windows 5.0.0-qa-56-1, build 1623069200. */
export declare const Windows_5_0_0_qa_56_1_1623069200: ClientVersion;
/** Windows 5.0.0-beta56, build 1623148575. */
export declare const Windows_5_0_0_beta56_1623148575: ClientVersion;
/** Linux 5.0.0-beta56, build 1623148575. */
export declare const Linux_5_0_0_beta56_1623148575: ClientVersion;
/** macOS 5.0.0-beta56, build 1623148575. */
export declare const macOS_5_0_0_beta56_1623148575: ClientVersion;
/** Windows 5.0.0-beta57-rc1, build 1623161118. */
export declare const Windows_5_0_0_beta57_rc1_1623161118: ClientVersion;
/** Linux 5.0.0-beta57-rc1, build 1623161118. */
export declare const Linux_5_0_0_beta57_rc1_1623161118: ClientVersion;
/** Windows 5.0.0-beta57-rc2, build 1623419125. */
export declare const Windows_5_0_0_beta57_rc2_1623419125: ClientVersion;
/** Linux 5.0.0-beta57-rc2, build 1623419125. */
export declare const Linux_5_0_0_beta57_rc2_1623419125: ClientVersion;
/** macOS 5.0.0-beta57-rc2, build 1623419125. */
export declare const macOS_5_0_0_beta57_rc2_1623419125: ClientVersion;
/** Windows 5.0.0-qa-57-2, build 1623680173. */
export declare const Windows_5_0_0_qa_57_2_1623680173: ClientVersion;
/** Windows 5.0.0-qa-57-3-1, build 1623703105. */
export declare const Windows_5_0_0_qa_57_3_1_1623703105: ClientVersion;
/** Windows 5.0.0-beta57, build 1623800045. */
export declare const Windows_5_0_0_beta57_1623800045: ClientVersion;
/** Linux 5.0.0-beta57, build 1623800045. */
export declare const Linux_5_0_0_beta57_1623800045: ClientVersion;
/** macOS 5.0.0-beta57, build 1623800045. */
export declare const macOS_5_0_0_beta57_1623800045: ClientVersion;
/** macOS 5.0.0-beta58-rc1, build 1623801564. */
export declare const macOS_5_0_0_beta58_rc1_1623801564: ClientVersion;
/** Windows 5.0.0-qa-ex-3, build 1623837149. */
export declare const Windows_5_0_0_qa_ex_3_1623837149: ClientVersion;
/** Windows 5.0.0-beta58-rc2, build 1623852877. */
export declare const Windows_5_0_0_beta58_rc2_1623852877: ClientVersion;
/** Linux 5.0.0-beta58-rc2, build 1623852877. */
export declare const Linux_5_0_0_beta58_rc2_1623852877: ClientVersion;
/** macOS 5.0.0-beta58-rc2, build 1623852877. */
export declare const macOS_5_0_0_beta58_rc2_1623852877: ClientVersion;
/** Windows 5.0.0-beta58-rc3, build 1624026633. */
export declare const Windows_5_0_0_beta58_rc3_1624026633: ClientVersion;
/** Linux 5.0.0-beta58-rc3, build 1624026633. */
export declare const Linux_5_0_0_beta58_rc3_1624026633: ClientVersion;
/** Windows 5.0.0-beta58-rc4, build 1624036539. */
export declare const Windows_5_0_0_beta58_rc4_1624036539: ClientVersion;
/** Linux 5.0.0-beta58-rc4, build 1624036539. */
export declare const Linux_5_0_0_beta58_rc4_1624036539: ClientVersion;
/** Windows 5.0.0-beta58-rc5, build 1624277263. */
export declare const Windows_5_0_0_beta58_rc5_1624277263: ClientVersion;
/** Linux 5.0.0-beta58-rc5, build 1624277263. */
export declare const Linux_5_0_0_beta58_rc5_1624277263: ClientVersion;
/** Windows 5.0.0-beta58-rc6, build 1624358903. */
export declare const Windows_5_0_0_beta58_rc6_1624358903: ClientVersion;
/** Linux 5.0.0-beta58-rc6, build 1624358903. */
export declare const Linux_5_0_0_beta58_rc6_1624358903: ClientVersion;
/** Windows 5.0.0-beta58-rc7, build 1624443135. */
export declare const Windows_5_0_0_beta58_rc7_1624443135: ClientVersion;
/** Linux 5.0.0-beta58-rc7, build 1624443135. */
export declare const Linux_5_0_0_beta58_rc7_1624443135: ClientVersion;
/** Windows 5.0.0-beta58, build 1624455116. */
export declare const Windows_5_0_0_beta58_1624455116: ClientVersion;
/** Linux 5.0.0-beta58, build 1624455116. */
export declare const Linux_5_0_0_beta58_1624455116: ClientVersion;
/** macOS 5.0.0-beta58, build 1624455116. */
export declare const macOS_5_0_0_beta58_1624455116: ClientVersion;
/** Windows 5.0.0-beta58.1, build 1625041456. */
export declare const Windows_5_0_0_beta58_1_1625041456: ClientVersion;
/** Linux 5.0.0-beta58.1, build 1625041456. */
export declare const Linux_5_0_0_beta58_1_1625041456: ClientVersion;
/** macOS 5.0.0-beta58.1, build 1625041456. */
export declare const macOS_5_0_0_beta58_1_1625041456: ClientVersion;
/** Windows 5.0.0-beta59-rc3, build 1625125975. */
export declare const Windows_5_0_0_beta59_rc3_1625125975: ClientVersion;
/** Linux 5.0.0-beta59-rc3, build 1625125975. */
export declare const Linux_5_0_0_beta59_rc3_1625125975: ClientVersion;
/** Windows 5.0.0-beta59-rc5, build 1625222996. */
export declare const Windows_5_0_0_beta59_rc5_1625222996: ClientVersion;
/** Linux 5.0.0-beta59-rc5, build 1625222996. */
export declare const Linux_5_0_0_beta59_rc5_1625222996: ClientVersion;
/** Windows 5.0.0-beta59-rc6, build 1625281448. */
export declare const Windows_5_0_0_beta59_rc6_1625281448: ClientVersion;
/** Linux 5.0.0-beta59-rc6, build 1625281448. */
export declare const Linux_5_0_0_beta59_rc6_1625281448: ClientVersion;
/** Windows 5.0.0-beta59, build 1625645480. */
export declare const Windows_5_0_0_beta59_1625645480: ClientVersion;
/** Linux 5.0.0-beta59, build 1625645480. */
export declare const Linux_5_0_0_beta59_1625645480: ClientVersion;
/** macOS 5.0.0-beta59, build 1625645480. */
export declare const macOS_5_0_0_beta59_1625645480: ClientVersion;
/** Windows 5.0.0-qa-60-0, build 1626366283. */
export declare const Windows_5_0_0_qa_60_0_1626366283: ClientVersion;
/** Windows 5.0.0-qa-60-5, build 1626875020. */
export declare const Windows_5_0_0_qa_60_5_1626875020: ClientVersion;
/** Windows 5.0.0-beta60-rc1, build 1627029564. */
export declare const Windows_5_0_0_beta60_rc1_1627029564: ClientVersion;
/** Linux 5.0.0-beta60-rc1, build 1627029564. */
export declare const Linux_5_0_0_beta60_rc1_1627029564: ClientVersion;
/** Windows 5.0.0-beta60-rc2, build 1627281941. */
export declare const Windows_5_0_0_beta60_rc2_1627281941: ClientVersion;
/** Windows 5.0.0-beta60-rc3, build 1627315911. */
export declare const Windows_5_0_0_beta60_rc3_1627315911: ClientVersion;
/** Windows 5.0.0-beta60-rc4, build 1627382772. */
export declare const Windows_5_0_0_beta60_rc4_1627382772: ClientVersion;
/** Windows 5.0.0-beta60, build 1627453078. */
export declare const Windows_5_0_0_beta60_1627453078: ClientVersion;
/** Linux 5.0.0-beta60, build 1627453078. */
export declare const Linux_5_0_0_beta60_1627453078: ClientVersion;
/** macOS 5.0.0-beta60, build 1627453078. */
export declare const macOS_5_0_0_beta60_1627453078: ClientVersion;
/** Windows 5.0.0-beta60.1, build 1627557732. */
export declare const Windows_5_0_0_beta60_1_1627557732: ClientVersion;
/** Linux 5.0.0-beta60.2, build 1627557732. */
export declare const Linux_5_0_0_beta60_2_1627557732: ClientVersion;
/** macOS 5.0.0-beta60.2, build 1627557732. */
export declare const macOS_5_0_0_beta60_2_1627557732: ClientVersion;
/** Windows 5.0.0-beta60.2, build 1627637709. */
export declare const Windows_5_0_0_beta60_2_1627637709: ClientVersion;
/** Linux 5.0.0-beta60.2, build 1627637709. */
export declare const Linux_5_0_0_beta60_2_1627637709: ClientVersion;
/** macOS 5.0.0-beta60.2, build 1627637709. */
export declare const macOS_5_0_0_beta60_2_1627637709: ClientVersion;
/** Windows 5.0.0-beta61-rc1, build 1627995830. */
export declare const Windows_5_0_0_beta61_rc1_1627995830: ClientVersion;
/** Linux 5.0.0-beta61-rc1, build 1627995830. */
export declare const Linux_5_0_0_beta61_rc1_1627995830: ClientVersion;
/** Windows 5.0.0-beta61-rc2, build 1628243130. */
export declare const Windows_5_0_0_beta61_rc2_1628243130: ClientVersion;
/** Linux 5.0.0-beta61-rc2, build 1628243130. */
export declare const Linux_5_0_0_beta61_rc2_1628243130: ClientVersion;
/** Linux 5.0.0-beta61-rc3, build 1628513934. */
export declare const Linux_5_0_0_beta61_rc3_1628513934: ClientVersion;
/** macOS 5.0.0-beta61-rc3, build 1628513934. */
export declare const macOS_5_0_0_beta61_rc3_1628513934: ClientVersion;
/** Windows 5.0.0-beta61, build 1628671407. */
export declare const Windows_5_0_0_beta61_1628671407: ClientVersion;
/** Linux 5.0.0-beta61, build 1628671407. */
export declare const Linux_5_0_0_beta61_1628671407: ClientVersion;
/** macOS 5.0.0-beta61, build 1628671407. */
export declare const macOS_5_0_0_beta61_1628671407: ClientVersion;
/** Linux 5.0.0-beta62-rc1, build 1628769114. */
export declare const Linux_5_0_0_beta62_rc1_1628769114: ClientVersion;
/** Windows 5.0.0-qa-1925-8, build 1628773544. */
export declare const Windows_5_0_0_qa_1925_8_1628773544: ClientVersion;
/** Windows 5.0.0-beta62-rc2, build 1628783944. */
export declare const Windows_5_0_0_beta62_rc2_1628783944: ClientVersion;
/** Linux 5.0.0-beta62-rc2, build 1628783944. */
export declare const Linux_5_0_0_beta62_rc2_1628783944: ClientVersion;
/** Windows 5.0.0-beta61.1, build 1628848434. */
export declare const Windows_5_0_0_beta61_1_1628848434: ClientVersion;
/** macOS 5.0.0-beta61.1, build 1628848434. */
export declare const macOS_5_0_0_beta61_1_1628848434: ClientVersion;
/** Windows 5.0.0-beta62-rc4, build 1629103760. */
export declare const Windows_5_0_0_beta62_rc4_1629103760: ClientVersion;
/** Linux 5.0.0-beta62-rc4, build 1629103760. */
export declare const Linux_5_0_0_beta62_rc4_1629103760: ClientVersion;
/** Windows 5.0.0-beta62-rc5, build 1629121366. */
export declare const Windows_5_0_0_beta62_rc5_1629121366: ClientVersion;
/** Windows 5.0.0-qa-1925-10, build 1629205202. */
export declare const Windows_5_0_0_qa_1925_10_1629205202: ClientVersion;
/** Windows 5.0.0-beta62, build 1629207214. */
export declare const Windows_5_0_0_beta62_1629207214: ClientVersion;
/** Linux 5.0.0-beta62, build 1629207214. */
export declare const Linux_5_0_0_beta62_1629207214: ClientVersion;
/** macOS 5.0.0-beta62, build 1629207214. */
export declare const macOS_5_0_0_beta62_1629207214: ClientVersion;
/** Windows 5.0.0-beta63-rc1, build 1629878569. */
export declare const Windows_5_0_0_beta63_rc1_1629878569: ClientVersion;
/** Linux 5.0.0-beta63-rc1, build 1629878569. */
export declare const Linux_5_0_0_beta63_rc1_1629878569: ClientVersion;
/** Windows 5.0.0-beta63-rc2, build 1629993565. */
export declare const Windows_5_0_0_beta63_rc2_1629993565: ClientVersion;
/** Linux 5.0.0-beta63-rc2, build 1629993565. */
export declare const Linux_5_0_0_beta63_rc2_1629993565: ClientVersion;
/** Windows 5.0.0-beta63-rc3, build 1630066856. */
export declare const Windows_5_0_0_beta63_rc3_1630066856: ClientVersion;
/** Windows 5.0.0-beta63-rc4, build 1630324970. */
export declare const Windows_5_0_0_beta63_rc4_1630324970: ClientVersion;
/** Windows 5.0.0-beta63-rc5, build 1630417664. */
export declare const Windows_5_0_0_beta63_rc5_1630417664: ClientVersion;
/** Linux 5.0.0-beta63-rc5, build 1630417664. */
export declare const Linux_5_0_0_beta63_rc5_1630417664: ClientVersion;
/** Windows 5.0.0-beta63-rc6, build 1630672687. */
export declare const Windows_5_0_0_beta63_rc6_1630672687: ClientVersion;
/** Linux 5.0.0-beta63-rc6, build 1630672687. */
export declare const Linux_5_0_0_beta63_rc6_1630672687: ClientVersion;
/** Windows 5.0.0-beta63-rc8, build 1630944479. */
export declare const Windows_5_0_0_beta63_rc8_1630944479: ClientVersion;
/** Windows 5.0.0-beta63-rc9, build 1631005853. */
export declare const Windows_5_0_0_beta63_rc9_1631005853: ClientVersion;
/** Linux 5.0.0-beta63-rc9, build 1631005853. */
export declare const Linux_5_0_0_beta63_rc9_1631005853: ClientVersion;
/** Windows 5.0.0-beta63, build 1631042126. */
export declare const Windows_5_0_0_beta63_1631042126: ClientVersion;
/** Linux 5.0.0-beta63, build 1631042126. */
export declare const Linux_5_0_0_beta63_1631042126: ClientVersion;
/** macOS 5.0.0-beta63, build 1631042126. */
export declare const macOS_5_0_0_beta63_1631042126: ClientVersion;
/** Windows 5.0.0-away-test8, build 1631200786. */
export declare const Windows_5_0_0_away_test8_1631200786: ClientVersion;
/** Windows 5.0.0-beta63.1, build 1631268231. */
export declare const Windows_5_0_0_beta63_1_1631268231: ClientVersion;
/** Linux 5.0.0-beta63.1, build 1631268231. */
export declare const Linux_5_0_0_beta63_1_1631268231: ClientVersion;
/** macOS 5.0.0-beta63.1, build 1631268231. */
export declare const macOS_5_0_0_beta63_1_1631268231: ClientVersion;
/** Windows 5.0.0-beta64-rc1, build 1631271008. */
export declare const Windows_5_0_0_beta64_rc1_1631271008: ClientVersion;
/** Windows 5.0.0-beta64-rc2, build 1631535074. */
export declare const Windows_5_0_0_beta64_rc2_1631535074: ClientVersion;
/** Windows 5.0.0-beta64-rc3, build 1631614018. */
export declare const Windows_5_0_0_beta64_rc3_1631614018: ClientVersion;
/** Linux 5.0.0-beta64-rc3, build 1631614018. */
export declare const Linux_5_0_0_beta64_rc3_1631614018: ClientVersion;
/** Windows 5.0.0-beta64, build 1631702252. */
export declare const Windows_5_0_0_beta64_1631702252: ClientVersion;
/** macOS 5.0.0-beta64, build 1631702252. */
export declare const macOS_5_0_0_beta64_1631702252: ClientVersion;
/** Windows 5.0.0-qa-66-1, build 1631885355. */
export declare const Windows_5_0_0_qa_66_1_1631885355: ClientVersion;
/** Windows 5.0.0-beta65, build 1632210487. */
export declare const Windows_5_0_0_beta65_1632210487: ClientVersion;
/** Linux 5.0.0-beta65, build 1632210487. */
export declare const Linux_5_0_0_beta65_1632210487: ClientVersion;
/** Windows 5.0.0-beta65.1-rc1, build 1632234637. */
export declare const Windows_5_0_0_beta65_1_rc1_1632234637: ClientVersion;
/** Windows 5.0.0-beta65.1, build 1632399768. */
export declare const Windows_5_0_0_beta65_1_1632399768: ClientVersion;
/** Linux 5.0.0-beta65.1, build 1632399768. */
export declare const Linux_5_0_0_beta65_1_1632399768: ClientVersion;
/** macOS 5.0.0-beta65.1, build 1632399768. */
export declare const macOS_5_0_0_beta65_1_1632399768: ClientVersion;
/** Windows 5.0.0-qa-66-4, build 1632410203. */
export declare const Windows_5_0_0_qa_66_4_1632410203: ClientVersion;
/** Windows 5.0.0-ms-2, build 1632754860. */
export declare const Windows_5_0_0_ms_2_1632754860: ClientVersion;
/** Windows 5.0.0-qa-66-6, build 1633006583. */
export declare const Windows_5_0_0_qa_66_6_1633006583: ClientVersion;
/** Windows 5.0.0-beta66-internal, build 1633604766. */
export declare const Windows_5_0_0_beta66_internal_1633604766: ClientVersion;
/** Windows 5.0.0-beta66-rc1, build 1634917358. */
export declare const Windows_5_0_0_beta66_rc1_1634917358: ClientVersion;
/** Linux 5.0.0-beta66-rc1, build 1634917358. */
export declare const Linux_5_0_0_beta66_rc1_1634917358: ClientVersion;
/** Windows 5.0.0-beta66, build 1635340287. */
export declare const Windows_5_0_0_beta66_1635340287: ClientVersion;
/** Linux 5.0.0-beta66, build 1635340287. */
export declare const Linux_5_0_0_beta66_1635340287: ClientVersion;
/** macOS 5.0.0-beta66, build 1635340287. */
export declare const macOS_5_0_0_beta66_1635340287: ClientVersion;
/** Windows 5.0.0-beta67-rc1, build 1635512518. */
export declare const Windows_5_0_0_beta67_rc1_1635512518: ClientVersion;
/** Linux 5.0.0-beta67-rc1, build 1635512518. */
export declare const Linux_5_0_0_beta67_rc1_1635512518: ClientVersion;
/** Windows 5.0.0-beta67-rc2, build 1636124060. */
export declare const Windows_5_0_0_beta67_rc2_1636124060: ClientVersion;
/** Linux 5.0.0-beta67-rc2, build 1636124060. */
export declare const Linux_5_0_0_beta67_rc2_1636124060: ClientVersion;
/** macOS 5.0.0-beta67-rc2, build 1636124060. */
export declare const macOS_5_0_0_beta67_rc2_1636124060: ClientVersion;
/** Windows 5.0.0-beta67-rc3, build 1636470636. */
export declare const Windows_5_0_0_beta67_rc3_1636470636: ClientVersion;
/** Linux 5.0.0-beta67-rc3, build 1636470636. */
export declare const Linux_5_0_0_beta67_rc3_1636470636: ClientVersion;
/** Windows 5.0.0-beta67-rc4, build 1636703696. */
export declare const Windows_5_0_0_beta67_rc4_1636703696: ClientVersion;
/** Linux 5.0.0-beta67-rc4, build 1636703696. */
export declare const Linux_5_0_0_beta67_rc4_1636703696: ClientVersion;
/** Windows 5.0.0-beta67-rc5, build 1637773695. */
export declare const Windows_5_0_0_beta67_rc5_1637773695: ClientVersion;
/** Linux 5.0.0-beta67-rc5, build 1637773695. */
export declare const Linux_5_0_0_beta67_rc5_1637773695: ClientVersion;
/** Windows 5.0.0-olm-refactor-1, build 1638283086. */
export declare const Windows_5_0_0_olm_refactor_1_1638283086: ClientVersion;
/** Windows 5.0.0-beta67, build 1638359901. */
export declare const Windows_5_0_0_beta67_1638359901: ClientVersion;
/** Linux 5.0.0-beta67, build 1638359901. */
export declare const Linux_5_0_0_beta67_1638359901: ClientVersion;
/** macOS 5.0.0-beta67, build 1638359901. */
export declare const macOS_5_0_0_beta67_1638359901: ClientVersion;
/** macOS 5.0.0-qa-68-2, build 1638544382. */
export declare const macOS_5_0_0_qa_68_2_1638544382: ClientVersion;
/** Windows 5.0.0-qa-store-update-dummy-fix-1, build 1639400688. */
export declare const Windows_5_0_0_qa_store_update_dummy_fix_1_1639400688: ClientVersion;
/** Windows 5.0.0-qa-store-update-dummy-fix-2, build 1639646105. */
export declare const Windows_5_0_0_qa_store_update_dummy_fix_2_1639646105: ClientVersion;
/** Windows 5.0.0-qa-th-16, build 1640003749. */
export declare const Windows_5_0_0_qa_th_16_1640003749: ClientVersion;
/** iOS 3.6.0, build 1640259570. */
export declare const iOS_3_6_0_1640259570: ClientVersion;
/** Windows 5.0.0-qa-68-7, build 1642008173. */
export declare const Windows_5_0_0_qa_68_7_1642008173: ClientVersion;
/** Windows 5.0.0-qa-68-9, build 1642074370. */
export declare const Windows_5_0_0_qa_68_9_1642074370: ClientVersion;
/** Windows 5.0.0-qa-68-10, build 1642155836. */
export declare const Windows_5_0_0_qa_68_10_1642155836: ClientVersion;
/** Windows 5.0.0-qa-68-11, build 1642428288. */
export declare const Windows_5_0_0_qa_68_11_1642428288: ClientVersion;
/** Windows 5.0.0-beta68-rc1, build 1642505026. */
export declare const Windows_5_0_0_beta68_rc1_1642505026: ClientVersion;
/** Linux 5.0.0-beta68-rc1, build 1642505026. */
export declare const Linux_5_0_0_beta68_rc1_1642505026: ClientVersion;
/** Windows 5.0.0-beta68-rc2, build 1642605878. */
export declare const Windows_5_0_0_beta68_rc2_1642605878: ClientVersion;
/** Linux 5.0.0-beta68-rc2, build 1642605878. */
export declare const Linux_5_0_0_beta68_rc2_1642605878: ClientVersion;
/** Windows 3.6.0, build 1642760631. */
export declare const Windows_3_6_0_1642760631: ClientVersion;
/** Windows 5.0.0-qa-68-20, build 1642762634. */
export declare const Windows_5_0_0_qa_68_20_1642762634: ClientVersion;
/** Windows 5.0.0-beta68-rc3, build 1643385351. */
export declare const Windows_5_0_0_beta68_rc3_1643385351: ClientVersion;
/** Linux 5.0.0-beta68-rc3, build 1643385351. */
export declare const Linux_5_0_0_beta68_rc3_1643385351: ClientVersion;
/** Windows 5.0.0-qa-68-26, build 1643637044. */
export declare const Windows_5_0_0_qa_68_26_1643637044: ClientVersion;
/** Windows 5.0.0-qa-68-27, build 1643641086. */
export declare const Windows_5_0_0_qa_68_27_1643641086: ClientVersion;
/** Windows 5.0.0-beta68, build 1643723246. */
export declare const Windows_5_0_0_beta68_1643723246: ClientVersion;
/** macOS 5.0.0-beta68, build 1643723246. */
export declare const macOS_5_0_0_beta68_1643723246: ClientVersion;
/** Windows 5.0.0-beta68.1, build 1643727795. */
export declare const Windows_5_0_0_beta68_1_1643727795: ClientVersion;
/** Windows 5.0.0-qa-69-5, build 1643982067. */
export declare const Windows_5_0_0_qa_69_5_1643982067: ClientVersion;
/** Windows 5.0.0-qa-69-6, build 1644241206. */
export declare const Windows_5_0_0_qa_69_6_1644241206: ClientVersion;
/** Windows 5.0.0-beta68.1, build 1644243684. */
export declare const Windows_5_0_0_beta68_1_1644243684: ClientVersion;
/** Linux 5.0.0-beta68.1, build 1644243684. */
export declare const Linux_5_0_0_beta68_1_1644243684: ClientVersion;
/** macOS 5.0.0-beta68.1, build 1644243684. */
export declare const macOS_5_0_0_beta68_1_1644243684: ClientVersion;
/** Windows 5.0.0-beta69-rc1, build 1644575557. */
export declare const Windows_5_0_0_beta69_rc1_1644575557: ClientVersion;
/** Windows 5.0.0-beta69-rc2, build 1644595314. */
export declare const Windows_5_0_0_beta69_rc2_1644595314: ClientVersion;
/** Linux 5.0.0-beta69-rc2, build 1644595314. */
export declare const Linux_5_0_0_beta69_rc2_1644595314: ClientVersion;
/** Windows 5.0.0-beta69-rc3, build 1644660819. */
export declare const Windows_5_0_0_beta69_rc3_1644660819: ClientVersion;
/** Linux 5.0.0-beta69-rc3, build 1644660819. */
export declare const Linux_5_0_0_beta69_rc3_1644660819: ClientVersion;
/** Windows 5.0.0-beta69-rc4, build 1645087682. */
export declare const Windows_5_0_0_beta69_rc4_1645087682: ClientVersion;
/** Linux 5.0.0-beta69-rc4, build 1645087682. */
export declare const Linux_5_0_0_beta69_rc4_1645087682: ClientVersion;
/** Android 5.0.0, build 1645113667. */
export declare const Android_5_0_0_1645113667: ClientVersion;
/** Windows 5.0.0-beta69-rc5, build 1645448271. */
export declare const Windows_5_0_0_beta69_rc5_1645448271: ClientVersion;
/** Windows 5.0.0-beta69-rc6, build 1645527496. */
export declare const Windows_5_0_0_beta69_rc6_1645527496: ClientVersion;
/** Linux 5.0.0-beta69-rc6, build 1645527496. */
export declare const Linux_5_0_0_beta69_rc6_1645527496: ClientVersion;
/** Windows 5.0.0-qa-69-12, build 1645630715. */
export declare const Windows_5_0_0_qa_69_12_1645630715: ClientVersion;
/** Windows 5.0.0-qa-69-14, build 1646064573. */
export declare const Windows_5_0_0_qa_69_14_1646064573: ClientVersion;
/** Windows 5.0.0-qa-69-15, build 1646165194. */
export declare const Windows_5_0_0_qa_69_15_1646165194: ClientVersion;
/** Windows 5.0.0-qa-69-16, build 1646319264. */
export declare const Windows_5_0_0_qa_69_16_1646319264: ClientVersion;
/** Windows 5.0.0-qa-69-18, build 1646666161. */
export declare const Windows_5_0_0_qa_69_18_1646666161: ClientVersion;
/** Windows 5.0.0-qa-69-20, build 1646829751. */
export declare const Windows_5_0_0_qa_69_20_1646829751: ClientVersion;
/** Windows 5.0.0-qa-request-chat-7, build 1646854452. */
export declare const Windows_5_0_0_qa_request_chat_7_1646854452: ClientVersion;
/** Windows 5.0.0-qa-69-21, build 1646935163. */
export declare const Windows_5_0_0_qa_69_21_1646935163: ClientVersion;
/** Windows 5.0.0-t-2915-2, build 1647254017. */
export declare const Windows_5_0_0_t_2915_2_1647254017: ClientVersion;
/** Windows 3.6.0, build 1647511767. */
export declare const Windows_3_6_0_1647511767: ClientVersion;
/** Windows 3.6.0, build 1647530723. */
export declare const Windows_3_6_0_1647530723: ClientVersion;
/** Windows 3.6.0, build 1647595742. */
export declare const Windows_3_6_0_1647595742: ClientVersion;
/** Linux 3.6.0, build 1647595742. */
export declare const Linux_3_6_0_1647595742: ClientVersion;
/** Windows 3.6.0, build 1647855949. */
export declare const Windows_3_6_0_1647855949: ClientVersion;
/** Linux 3.6.0, build 1647855949. */
export declare const Linux_3_6_0_1647855949: ClientVersion;
/** Windows 3.6.0, build 1647921962. */
export declare const Windows_3_6_0_1647921962: ClientVersion;
/** Windows 3.6.0, build 1647928456. */
export declare const Windows_3_6_0_1647928456: ClientVersion;
/** Windows 3.6.0, build 1647939487. */
export declare const Windows_3_6_0_1647939487: ClientVersion;
/** Windows 3.6.0, build 1647949292. */
export declare const Windows_3_6_0_1647949292: ClientVersion;
/** macOS 3.6.0, build 1647949292. */
export declare const macOS_3_6_0_1647949292: ClientVersion;
/** Windows 5.0.0-qa-69-26, build 1648062270. */
export declare const Windows_5_0_0_qa_69_26_1648062270: ClientVersion;
/** Windows 3.6.0, build 1648153885. */
export declare const Windows_3_6_0_1648153885: ClientVersion;
/** Linux 3.6.0, build 1648153885. */
export declare const Linux_3_6_0_1648153885: ClientVersion;
/** macOS 3.6.0, build 1648153885. */
export declare const macOS_3_6_0_1648153885: ClientVersion;
/** Windows 5.0.0-qa-69-27, build 1648222308. */
export declare const Windows_5_0_0_qa_69_27_1648222308: ClientVersion;
/** Windows 5.0.0-qa-69-28, build 1648740980. */
export declare const Windows_5_0_0_qa_69_28_1648740980: ClientVersion;
/** Windows 5.0.0-qa-69-29, build 1649081557. */
export declare const Windows_5_0_0_qa_69_29_1649081557: ClientVersion;
/** Windows 5.0.0-qa-69-30, build 1649229901. */
export declare const Windows_5_0_0_qa_69_30_1649229901: ClientVersion;
/** Windows 5.0.0-beta69-rc8, build 1650464356. */
export declare const Windows_5_0_0_beta69_rc8_1650464356: ClientVersion;
/** Linux 5.0.0-beta69-rc8, build 1650474918. */
export declare const Linux_5_0_0_beta69_rc8_1650474918: ClientVersion;
/** macOS 5.0.0-beta69-rc8, build 1650474918. */
export declare const macOS_5_0_0_beta69_rc8_1650474918: ClientVersion;
/** Windows 5.0.0-beta69, build 1651157621. */
export declare const Windows_5_0_0_beta69_1651157621: ClientVersion;
/** Linux 5.0.0-beta69, build 1651157621. */
export declare const Linux_5_0_0_beta69_1651157621: ClientVersion;
/** Windows 5.0.0-beta69, build 1651486956. */
export declare const Windows_5_0_0_beta69_1651486956: ClientVersion;
/** Linux 5.0.0-beta69, build 1651486956. */
export declare const Linux_5_0_0_beta69_1651486956: ClientVersion;
/** macOS 5.0.0-beta69, build 1651486956. */
export declare const macOS_5_0_0_beta69_1651486956: ClientVersion;
/** Windows 5.0.0-qa-69-34, build 1651687542. */
export declare const Windows_5_0_0_qa_69_34_1651687542: ClientVersion;
/** Linux 5.0.0-beta70-rc2, build 1651730595. */
export declare const Linux_5_0_0_beta70_rc2_1651730595: ClientVersion;
/** Windows 5.0.0-t-2915-7, build 1652106526. */
export declare const Windows_5_0_0_t_2915_7_1652106526: ClientVersion;
/** Windows 5.0.0-qa-70-1, build 1652113760. */
export declare const Windows_5_0_0_qa_70_1_1652113760: ClientVersion;
/** Windows 5.0.0-beta70-rc3, build 1652281502. */
export declare const Windows_5_0_0_beta70_rc3_1652281502: ClientVersion;
/** Linux 5.0.0-beta70-rc3, build 1652281502. */
export declare const Linux_5_0_0_beta70_rc3_1652281502: ClientVersion;
/** Windows 5.0.0-beta70-rc4, build 1652448464. */
export declare const Windows_5_0_0_beta70_rc4_1652448464: ClientVersion;
/** Linux 5.0.0-beta70-rc4, build 1652448464. */
export declare const Linux_5_0_0_beta70_rc4_1652448464: ClientVersion;
/** Windows 5.0.0-qa-70-2, build 1652873884. */
export declare const Windows_5_0_0_qa_70_2_1652873884: ClientVersion;
/** Windows 5.0.0-beta70-rc5, build 1653042652. */
export declare const Windows_5_0_0_beta70_rc5_1653042652: ClientVersion;
/** Windows 5.0.0-beta70-rc6, build 1653467861. */
export declare const Windows_5_0_0_beta70_rc6_1653467861: ClientVersion;
/** Linux 5.0.0-beta70-rc6, build 1653467861. */
export declare const Linux_5_0_0_beta70_rc6_1653467861: ClientVersion;
/** Windows 3.6.0, build 1654006450. */
export declare const Windows_3_6_0_1654006450: ClientVersion;
/** Windows 5.0.0-beta70-rc7, build 1654093906. */
export declare const Windows_5_0_0_beta70_rc7_1654093906: ClientVersion;
/** Linux 5.0.0-beta70-rc7, build 1654093906. */
export declare const Linux_5_0_0_beta70_rc7_1654093906: ClientVersion;
/** Windows 3.6.0, build 1654160172. */
export declare const Windows_3_6_0_1654160172: ClientVersion;
/** macOS 3.6.0, build 1654160172. */
export declare const macOS_3_6_0_1654160172: ClientVersion;
/** Windows 5.0.0-beta70, build 1654676785. */
export declare const Windows_5_0_0_beta70_1654676785: ClientVersion;
/** Linux 5.0.0-beta70, build 1654676785. */
export declare const Linux_5_0_0_beta70_1654676785: ClientVersion;
/** macOS 5.0.0-beta70, build 1654676785. */
export declare const macOS_5_0_0_beta70_1654676785: ClientVersion;
/** Windows 5.0.0-qa-2913-2, build 1655205340. */
export declare const Windows_5_0_0_qa_2913_2_1655205340: ClientVersion;
/** Linux 5.0.0-qa-2913-2, build 1655205340. */
export declare const Linux_5_0_0_qa_2913_2_1655205340: ClientVersion;
/** Windows 5.0.0-qa-2913-3, build 1655733884. */
export declare const Windows_5_0_0_qa_2913_3_1655733884: ClientVersion;
/** Windows 5.0.0-beta71-rc1, build 1655990880. */
export declare const Windows_5_0_0_beta71_rc1_1655990880: ClientVersion;
/** Windows 5.0.0-beta71-rc2, build 1656340141. */
export declare const Windows_5_0_0_beta71_rc2_1656340141: ClientVersion;
/** Linux 5.0.0-beta71-rc2, build 1656340141. */
export declare const Linux_5_0_0_beta71_rc2_1656340141: ClientVersion;
/** Windows 5.0.0-qa-71-1, build 1656589081. */
export declare const Windows_5_0_0_qa_71_1_1656589081: ClientVersion;
/** Windows 5.0.0-qa-71-2, build 1657105351. */
export declare const Windows_5_0_0_qa_71_2_1657105351: ClientVersion;
/** Windows 5.0.0-beta71-rc3, build 1657116184. */
export declare const Windows_5_0_0_beta71_rc3_1657116184: ClientVersion;
/** Windows 5.0.0-beta71-rc4, build 1657196441. */
export declare const Windows_5_0_0_beta71_rc4_1657196441: ClientVersion;
/** Linux 5.0.0-beta71-rc4, build 1657196441. */
export declare const Linux_5_0_0_beta71_rc4_1657196441: ClientVersion;
/** Windows 5.0.0-qa-71-3, build 1657550670. */
export declare const Windows_5_0_0_qa_71_3_1657550670: ClientVersion;
/** Windows 5.0.0-beta71-rc6, build 1657710601. */
export declare const Windows_5_0_0_beta71_rc6_1657710601: ClientVersion;
/** Linux 5.0.0-beta71-rc6, build 1657710601. */
export declare const Linux_5_0_0_beta71_rc6_1657710601: ClientVersion;
/** Windows 5.0.0-tra-09, build 1657880771. */
export declare const Windows_5_0_0_tra_09_1657880771: ClientVersion;
/** Linux 5.0.0-beta71-rc7, build 1658908364. */
export declare const Linux_5_0_0_beta71_rc7_1658908364: ClientVersion;
/** macOS 5.0.0-beta71-rc7, build 1658908364. */
export declare const macOS_5_0_0_beta71_rc7_1658908364: ClientVersion;
/** Windows 5.0.0-qa-71-4, build 1659089293. */
export declare const Windows_5_0_0_qa_71_4_1659089293: ClientVersion;
/** Windows 5.0.0-qa-71-5, build 1659598962. */
export declare const Windows_5_0_0_qa_71_5_1659598962: ClientVersion;
/** Windows 5.0.0-qa-71-6, build 1659957641. */
export declare const Windows_5_0_0_qa_71_6_1659957641: ClientVersion;
/** Windows 5.0.0-qa-71-7, build 1661262442. */
export declare const Windows_5_0_0_qa_71_7_1661262442: ClientVersion;
/** Windows 5.0.0-beta71-rc9, build 1661354034. */
export declare const Windows_5_0_0_beta71_rc9_1661354034: ClientVersion;
/** Windows 5.0.0-qa-3231-7, build 1661783707. */
export declare const Windows_5_0_0_qa_3231_7_1661783707: ClientVersion;
/** Windows 5.0.0-beta71-rc12, build 1661967524. */
export declare const Windows_5_0_0_beta71_rc12_1661967524: ClientVersion;
/** Windows 5.0.0-beta71-rc13, build 1662123474. */
export declare const Windows_5_0_0_beta71_rc13_1662123474: ClientVersion;
/** Linux 5.0.0-beta71-rc13, build 1662123474. */
export declare const Linux_5_0_0_beta71_rc13_1662123474: ClientVersion;
/** macOS 5.0.0-beta71-rc13, build 1662123474. */
export declare const macOS_5_0_0_beta71_rc13_1662123474: ClientVersion;
/** Windows 3.6.0, build 1662544077. */
export declare const Windows_3_6_0_1662544077: ClientVersion;
/** Linux 3.6.0, build 1662544077. */
export declare const Linux_3_6_0_1662544077: ClientVersion;
/** Windows 5.0.0-qa-3305-rc13, build 1662565498. */
export declare const Windows_5_0_0_qa_3305_rc13_1662565498: ClientVersion;
/** Windows 5.0.0-qa-71-8, build 1662994626. */
export declare const Windows_5_0_0_qa_71_8_1662994626: ClientVersion;
/** Windows 5.0.0-beta71-rc14, build 1663228073. */
export declare const Windows_5_0_0_beta71_rc14_1663228073: ClientVersion;
/** Linux 5.0.0-beta71-rc14, build 1663228073. */
export declare const Linux_5_0_0_beta71_rc14_1663228073: ClientVersion;
/** Windows 5.0.0-qa-pre-crypto-fixes, build 1663230086. */
export declare const Windows_5_0_0_qa_pre_crypto_fixes_1663230086: ClientVersion;
/** Windows 5.0.0-qa-crypto-fixes-1, build 1663662700. */
export declare const Windows_5_0_0_qa_crypto_fixes_1_1663662700: ClientVersion;
/** Windows 5.0.0-qa-crypto-test-on-rc14-2, build 1663768885. */
export declare const Windows_5_0_0_qa_crypto_test_on_rc14_2_1663768885: ClientVersion;
/** Windows 5.0.0-ui-polishing-11, build 1664554487. */
export declare const Windows_5_0_0_ui_polishing_11_1664554487: ClientVersion;
/** Windows 5.0.0-qa-crypto-fixes-3, build 1666096977. */
export declare const Windows_5_0_0_qa_crypto_fixes_3_1666096977: ClientVersion;
/** Windows 5.0.0-qa-71-9, build 1666179837. */
export declare const Windows_5_0_0_qa_71_9_1666179837: ClientVersion;
/** Windows 5.0.0-qa-71-10, build 1666256439. */
export declare const Windows_5_0_0_qa_71_10_1666256439: ClientVersion;
/** Windows 5.0.0-qa-71-12, build 1666360320. */
export declare const Windows_5_0_0_qa_71_12_1666360320: ClientVersion;
/** Windows 5.0.0-beta71-rc15, build 1666706353. */
export declare const Windows_5_0_0_beta71_rc15_1666706353: ClientVersion;
/** Linux 5.0.0-beta71-rc15, build 1666706353. */
export declare const Linux_5_0_0_beta71_rc15_1666706353: ClientVersion;
/** Windows 3.6.0, build 1666781655. */
export declare const Windows_3_6_0_1666781655: ClientVersion;
/** Linux 3.6.0, build 1666781655. */
export declare const Linux_3_6_0_1666781655: ClientVersion;
/** macOS 3.6.0, build 1666781655. */
export declare const macOS_3_6_0_1666781655: ClientVersion;
/** Windows 5.0.0-qa-3230-1, build 1667372765. */
export declare const Windows_5_0_0_qa_3230_1_1667372765: ClientVersion;
/** Windows 5.0.0-qa-71-15, build 1667384582. */
export declare const Windows_5_0_0_qa_71_15_1667384582: ClientVersion;
/** Windows 5.0.0-qa-3230-2, build 1667811609. */
export declare const Windows_5_0_0_qa_3230_2_1667811609: ClientVersion;
/** Android 3.6.0, build 1667819930. */
export declare const Android_3_6_0_1667819930: ClientVersion;
/** Windows 5.0.0-qa-71-17, build 1667845499. */
export declare const Windows_5_0_0_qa_71_17_1667845499: ClientVersion;
/** Windows 5.0.0-qa-71-18, build 1668000845. */
export declare const Windows_5_0_0_qa_71_18_1668000845: ClientVersion;
/** Windows 3.6.0, build 1668022263. */
export declare const Windows_3_6_0_1668022263: ClientVersion;
/** Windows 5.0.0-qa-71-19, build 1668103173. */
export declare const Windows_5_0_0_qa_71_19_1668103173: ClientVersion;
/** Windows 5.0.0-qa-71-21, build 1668448738. */
export declare const Windows_5_0_0_qa_71_21_1668448738: ClientVersion;
/** Windows 5.0.0-qa-71-24, build 1668688049. */
export declare const Windows_5_0_0_qa_71_24_1668688049: ClientVersion;
/** Windows 5.0.0-beta71-rc16, build 1668705307. */
export declare const Windows_5_0_0_beta71_rc16_1668705307: ClientVersion;
/** Linux 5.0.0-beta71-rc16, build 1668705307. */
export declare const Linux_5_0_0_beta71_rc16_1668705307: ClientVersion;
/** Windows 5.0.0-qa-71-26, build 1669036474. */
export declare const Windows_5_0_0_qa_71_26_1669036474: ClientVersion;
/** Windows 5.0.0-qa-71-29, build 1669300286. */
export declare const Windows_5_0_0_qa_71_29_1669300286: ClientVersion;
/** Windows 5.0.0-beta71, build 1670237565. */
export declare const Windows_5_0_0_beta71_1670237565: ClientVersion;
/** Linux 5.0.0-beta71, build 1670237565. */
export declare const Linux_5_0_0_beta71_1670237565: ClientVersion;
/** macOS 5.0.0-beta71, build 1670237565. */
export declare const macOS_5_0_0_beta71_1670237565: ClientVersion;
/** Windows 5.0.0-beta72, build 1671465207. */
export declare const Windows_5_0_0_beta72_1671465207: ClientVersion;
/** Windows 5.0.0-beta72-rc1, build 1671465207. */
export declare const Windows_5_0_0_beta72_rc1_1671465207: ClientVersion;
/** Linux 5.0.0-beta72, build 1671465207. */
export declare const Linux_5_0_0_beta72_1671465207: ClientVersion;
/** Windows 5.0.0-qa-73-3, build 1673952226. */
export declare const Windows_5_0_0_qa_73_3_1673952226: ClientVersion;
/** Windows 5.0.0-qa-73-11, build 1676933790. */
export declare const Windows_5_0_0_qa_73_11_1676933790: ClientVersion;
/** Windows 5.0.0-beta73-rc1, build 1677076356. */
export declare const Windows_5_0_0_beta73_rc1_1677076356: ClientVersion;
/** Linux 5.0.0-beta73-rc1, build 1677076356. */
export declare const Linux_5_0_0_beta73_rc1_1677076356: ClientVersion;
/** Windows 5.0.0-beta73-rc3, build 1677756122. */
export declare const Windows_5_0_0_beta73_rc3_1677756122: ClientVersion;
/** Linux 5.0.0-beta73-rc3, build 1677756122. */
export declare const Linux_5_0_0_beta73_rc3_1677756122: ClientVersion;
/** Windows 5.0.0-beta73, build 1679397420. */
export declare const Windows_5_0_0_beta73_1679397420: ClientVersion;
/** Linux 5.0.0-beta73, build 1679397420. */
export declare const Linux_5_0_0_beta73_1679397420: ClientVersion;
/** OS X 5.0.0-beta73, build 1679397420. */
export declare const OSX_5_0_0_beta73_1679397420: ClientVersion;
/** Windows 5.0.0-qa-74-1, build 1679398750. */
export declare const Windows_5_0_0_qa_74_1_1679398750: ClientVersion;
/** Windows 5.0.0-qa-74-2, build 1679472836. */
export declare const Windows_5_0_0_qa_74_2_1679472836: ClientVersion;
/** Windows 5.0.0-qa-74-3, build 1679578894. */
export declare const Windows_5_0_0_qa_74_3_1679578894: ClientVersion;
/** Windows 5.0.0-qa-74-5, build 1680085518. */
export declare const Windows_5_0_0_qa_74_5_1680085518: ClientVersion;
/** Windows 5.0.0-qa-74-7, build 1681481733. */
export declare const Windows_5_0_0_qa_74_7_1681481733: ClientVersion;
/** OS X 3.6.0, build 1681728436. */
export declare const OSX_3_6_0_1681728436: ClientVersion;
/** Windows 5.0.0-qa-74-8, build 1681821920. */
export declare const Windows_5_0_0_qa_74_8_1681821920: ClientVersion;
/** Windows 5.0.0-qa-74-10, build 1682065994. */
export declare const Windows_5_0_0_qa_74_10_1682065994: ClientVersion;
/** Windows 5.0.0-qa-dc-1, build 1682080978. */
export declare const Windows_5_0_0_qa_dc_1_1682080978: ClientVersion;
/** Windows 5.0.0-qa-74-11, build 1682337867. */
export declare const Windows_5_0_0_qa_74_11_1682337867: ClientVersion;
/** Windows 5.0.0-qa-74-13, build 1682589154. */
export declare const Windows_5_0_0_qa_74_13_1682589154: ClientVersion;
/** Windows 5.0.0-qa-74-14, build 1682680770. */
export declare const Windows_5_0_0_qa_74_14_1682680770: ClientVersion;
/** Windows 5.0.0-qa-74-15, build 1683039954. */
export declare const Windows_5_0_0_qa_74_15_1683039954: ClientVersion;
/** Windows 3.6.0, build 1683203743. */
export declare const Windows_3_6_0_1683203743: ClientVersion;
/** Linux 3.6.0, build 1683203743. */
export declare const Linux_3_6_0_1683203743: ClientVersion;
/** OS X 3.6.0, build 1683203743. */
export declare const OSX_3_6_0_1683203743: ClientVersion;
/** Windows 5.0.0-qa-74-17, build 1683295507. */
export declare const Windows_5_0_0_qa_74_17_1683295507: ClientVersion;
/** Windows 5.0.0-beta74, build 1683627550. */
export declare const Windows_5_0_0_beta74_1683627550: ClientVersion;
/** Linux 5.0.0-beta74, build 1683627550. */
export declare const Linux_5_0_0_beta74_1683627550: ClientVersion;
/** macOS 5.0.0-beta74, build 1683627550. */
export declare const macOS_5_0_0_beta74_1683627550: ClientVersion;
/** Windows 5.0.0-qa-tr-1, build 1683731563. */
export declare const Windows_5_0_0_qa_tr_1_1683731563: ClientVersion;
/** Windows 3.6.0, build 1683804569. */
export declare const Windows_3_6_0_1683804569: ClientVersion;
/** Linux 3.6.0, build 1683804569. */
export declare const Linux_3_6_0_1683804569: ClientVersion;
/** OS X 3.6.0, build 1683804569. */
export declare const OSX_3_6_0_1683804569: ClientVersion;
/** Windows 5.0.0-qa-75-1, build 1684855710. */
export declare const Windows_5_0_0_qa_75_1_1684855710: ClientVersion;
/** Windows 5.0.0-qa-75-2, build 1685542148. */
export declare const Windows_5_0_0_qa_75_2_1685542148: ClientVersion;
/** OS X 3.6.0, build 1685546268. */
export declare const OSX_3_6_0_1685546268: ClientVersion;
/** Windows 5.0.0-beta75-rc1, build 1685698093. */
export declare const Windows_5_0_0_beta75_rc1_1685698093: ClientVersion;
/** Windows 5.0.0-beta75-rc2, build 1686050172. */
export declare const Windows_5_0_0_beta75_rc2_1686050172: ClientVersion;
/** Windows 5.0.0-beta75-rc3, build 1686126230. */
export declare const Windows_5_0_0_beta75_rc3_1686126230: ClientVersion;
/** macOS 5.0.0-beta75-rc3, build 1686126230. */
export declare const macOS_5_0_0_beta75_rc3_1686126230: ClientVersion;
/** Windows 3.6.0, build 1686637110. */
export declare const Windows_3_6_0_1686637110: ClientVersion;
/** Linux 3.6.0, build 1686637110. */
export declare const Linux_3_6_0_1686637110: ClientVersion;
/** Windows 3.6.0, build 1686731472. */
export declare const Windows_3_6_0_1686731472: ClientVersion;
/** Linux 3.6.0, build 1686731472. */
export declare const Linux_3_6_0_1686731472: ClientVersion;
/** Windows 3.6.0, build 1686736529. */
export declare const Windows_3_6_0_1686736529: ClientVersion;
/** Linux 3.6.0, build 1686736529. */
export declare const Linux_3_6_0_1686736529: ClientVersion;
/** OS X 3.6.0, build 1686736529. */
export declare const OSX_3_6_0_1686736529: ClientVersion;
/** Windows 3.6.0, build 1686744367. */
export declare const Windows_3_6_0_1686744367: ClientVersion;
/** Linux 3.6.0, build 1686744367. */
export declare const Linux_3_6_0_1686744367: ClientVersion;
/** Windows 3.6.0, build 1686749764. */
export declare const Windows_3_6_0_1686749764: ClientVersion;
/** Linux 3.6.0, build 1686749764. */
export declare const Linux_3_6_0_1686749764: ClientVersion;
/** OS X 3.6.0, build 1686749764. */
export declare const OSX_3_6_0_1686749764: ClientVersion;
/** Windows 5.0.0-beta75-rc4, build 1687777367. */
export declare const Windows_5_0_0_beta75_rc4_1687777367: ClientVersion;
/** Linux 5.0.0-beta75-rc4, build 1687777367. */
export declare const Linux_5_0_0_beta75_rc4_1687777367: ClientVersion;
/** macOS 5.0.0-beta75-rc4, build 1687777367. */
export declare const macOS_5_0_0_beta75_rc4_1687777367: ClientVersion;
/** Windows 5.0.0-beta75-rc5, build 1687944933. */
export declare const Windows_5_0_0_beta75_rc5_1687944933: ClientVersion;
/** Windows 3.6.1, build 1689766945. */
export declare const Windows_3_6_1_1689766945: ClientVersion;
/** Linux 3.6.1, build 1689766945. */
export declare const Linux_3_6_1_1689766945: ClientVersion;
/** Windows 3.6.1, build 1689949736. */
export declare const Windows_3_6_1_1689949736: ClientVersion;
/** Linux 3.6.1, build 1689949736. */
export declare const Linux_3_6_1_1689949736: ClientVersion;
/** Windows 3.6.1, build 1690193193. */
export declare const Windows_3_6_1_1690193193: ClientVersion;
/** Linux 3.6.1, build 1690193193. */
export declare const Linux_3_6_1_1690193193: ClientVersion;
/** OS X 3.6.1, build 1690193193. */
export declare const OSX_3_6_1_1690193193: ClientVersion;
/** Windows 5.0.0-beta75-rc7, build 1690443874. */
export declare const Windows_5_0_0_beta75_rc7_1690443874: ClientVersion;
/** Windows 3.6.1, build 1690811573. */
export declare const Windows_3_6_1_1690811573: ClientVersion;
/** Windows 3.6.1, build 1690872913. */
export declare const Windows_3_6_1_1690872913: ClientVersion;
/** Windows 5.0.0-beta75-rc8, build 1690875928. */
export declare const Windows_5_0_0_beta75_rc8_1690875928: ClientVersion;
/** Windows 5.0.0-qa-75-4, build 1690964581. */
export declare const Windows_5_0_0_qa_75_4_1690964581: ClientVersion;
/** Windows 3.6.2, build 1690976575. */
export declare const Windows_3_6_2_1690976575: ClientVersion;
/** Linux 3.6.2, build 1690976575. */
export declare const Linux_3_6_2_1690976575: ClientVersion;
/** OS X 3.6.2, build 1690976575. */
export declare const OSX_3_6_2_1690976575: ClientVersion;
/** Windows 5.0.0-qa-75-8, build 1691162334. */
export declare const Windows_5_0_0_qa_75_8_1691162334: ClientVersion;
/** macOS 5.0.0-qa-75-8, build 1691162334. */
export declare const macOS_5_0_0_qa_75_8_1691162334: ClientVersion;
/** Windows 5.0.0-beta75-rc10, build 1691405422. */
export declare const Windows_5_0_0_beta75_rc10_1691405422: ClientVersion;
/** Windows 5.0.0-qa-75-9, build 1691734909. */
export declare const Windows_5_0_0_qa_75_9_1691734909: ClientVersion;
/** Windows 5.0.0-qa-tr-2, build 1691758984. */
export declare const Windows_5_0_0_qa_tr_2_1691758984: ClientVersion;
/** Windows 5.0.0-beta75-rc11, build 1692269983. */
export declare const Windows_5_0_0_beta75_rc11_1692269983: ClientVersion;
/** Windows 5.0.0-beta75-rc12, build 1692273792. */
export declare const Windows_5_0_0_beta75_rc12_1692273792: ClientVersion;
/** Linux 5.0.0-beta75-rc12, build 1692273792. */
export declare const Linux_5_0_0_beta75_rc12_1692273792: ClientVersion;
/** macOS 5.0.0-beta75-rc12, build 1692273792. */
export declare const macOS_5_0_0_beta75_rc12_1692273792: ClientVersion;
/** Windows 5.0.0-qa-75-10, build 1692281089. */
export declare const Windows_5_0_0_qa_75_10_1692281089: ClientVersion;
/** Windows 5.0.0-qa-75-11, build 1692344346. */
export declare const Windows_5_0_0_qa_75_11_1692344346: ClientVersion;
/** Windows 5.0.0-qa-75-12, build 1692942703. */
export declare const Windows_5_0_0_qa_75_12_1692942703: ClientVersion;
/** Windows 5.0.0-qa-tr-4, build 1692956820. */
export declare const Windows_5_0_0_qa_tr_4_1692956820: ClientVersion;
/** Windows 5.0.0-qa-75-14, build 1693548790. */
export declare const Windows_5_0_0_qa_75_14_1693548790: ClientVersion;
/** Linux 5.0.0-qa-75-14, build 1693548790. */
export declare const Linux_5_0_0_qa_75_14_1693548790: ClientVersion;
/** Windows 5.0.0-qa-tr-6, build 1693832989. */
export declare const Windows_5_0_0_qa_tr_6_1693832989: ClientVersion;
/** Linux 5.0.0-qa-tr-6, build 1693832989. */
export declare const Linux_5_0_0_qa_tr_6_1693832989: ClientVersion;
/** Windows 5.0.0-qa-75-16, build 1694525079. */
export declare const Windows_5_0_0_qa_75_16_1694525079: ClientVersion;
/** Windows 5.0.0-qa-75-17, build 1694593665. */
export declare const Windows_5_0_0_qa_75_17_1694593665: ClientVersion;
/** Windows 5.0.0-qa-75-18, build 1694615531. */
export declare const Windows_5_0_0_qa_75_18_1694615531: ClientVersion;
/** Windows 5.0.0-qa-75-19, build 1694699313. */
export declare const Windows_5_0_0_qa_75_19_1694699313: ClientVersion;
/** Windows 3.6.2, build 1695203293. */
export declare const Windows_3_6_2_1695203293: ClientVersion;
/** Linux 3.6.2, build 1695203293. */
export declare const Linux_3_6_2_1695203293: ClientVersion;
/** OS X 3.6.2, build 1695203293. */
export declare const OSX_3_6_2_1695203293: ClientVersion;
/** Windows 5.0.0-beta75-rc13, build 1695397203. */
export declare const Windows_5_0_0_beta75_rc13_1695397203: ClientVersion;
/** macOS 5.0.0-beta75-rc13, build 1695397203. */
export declare const macOS_5_0_0_beta75_rc13_1695397203: ClientVersion;
/** Windows 5.0.0-beta75-rc14, build 1696088917. */
export declare const Windows_5_0_0_beta75_rc14_1696088917: ClientVersion;
/** Windows 5.0.0-beta75-rc14, build 1696489500. */
export declare const Windows_5_0_0_beta75_rc14_1696489500: ClientVersion;
/** Windows 5.0.0-beta75, build 1696607978. */
export declare const Windows_5_0_0_beta75_1696607978: ClientVersion;
/** Linux 5.0.0-beta75, build 1696607978. */
export declare const Linux_5_0_0_beta75_1696607978: ClientVersion;
/** macOS 5.0.0-beta75, build 1696607978. */
export declare const macOS_5_0_0_beta75_1696607978: ClientVersion;
/** Windows 5.0.0-beta76-rc1, build 1697033899. */
export declare const Windows_5_0_0_beta76_rc1_1697033899: ClientVersion;
/** macOS 5.0.0-beta76-rc1, build 1697033899. */
export declare const macOS_5_0_0_beta76_rc1_1697033899: ClientVersion;
/** Windows 5.0.0-beta76-rc5, build 1697802195. */
export declare const Windows_5_0_0_beta76_rc5_1697802195: ClientVersion;
/** macOS 5.0.0-beta76-rc5, build 1697802195. */
export declare const macOS_5_0_0_beta76_rc5_1697802195: ClientVersion;
/** Windows 5.0.0-beta76, build 1698243642. */
export declare const Windows_5_0_0_beta76_1698243642: ClientVersion;
/** Linux 5.0.0-beta76, build 1698243642. */
export declare const Linux_5_0_0_beta76_1698243642: ClientVersion;
/** macOS 5.0.0-beta76, build 1698243642. */
export declare const macOS_5_0_0_beta76_1698243642: ClientVersion;
/** macOS 5.0.0-qa-77-1, build 1698316110. */
export declare const macOS_5_0_0_qa_77_1_1698316110: ClientVersion;
/** Windows 5.0.0-beta77, build 1699457285. */
export declare const Windows_5_0_0_beta77_1699457285: ClientVersion;
/** Linux 5.0.0-beta77-rc1, build 1700224895. */
export declare const Linux_5_0_0_beta77_rc1_1700224895: ClientVersion;
/** macOS 5.0.0-beta77-rc1, build 1700224895. */
export declare const macOS_5_0_0_beta77_rc1_1700224895: ClientVersion;
/** Windows 5.0.0-beta77-rc2, build 1700761919. */
export declare const Windows_5_0_0_beta77_rc2_1700761919: ClientVersion;
/** Linux 5.0.0-beta77-rc2, build 1700761919. */
export declare const Linux_5_0_0_beta77_rc2_1700761919: ClientVersion;
/** Windows 3.6.3, build 1701166057. */
export declare const Windows_3_6_3_1701166057: ClientVersion;
/** Linux 5.0.0-beta77-rc3, build 1701707182. */
export declare const Linux_5_0_0_beta77_rc3_1701707182: ClientVersion;
/** Windows 5.0.0-beta77, build 1702382332. */
export declare const Windows_5_0_0_beta77_1702382332: ClientVersion;
/** Linux 5.0.0-beta77, build 1702382332. */
export declare const Linux_5_0_0_beta77_1702382332: ClientVersion;
/** macOS 5.0.0-beta77, build 1702382332. */
export declare const macOS_5_0_0_beta77_1702382332: ClientVersion;
/** Windows 5.0.0-qa-lm-29, build 1719554519. */
export declare const Windows_5_0_0_qa_lm_29_1719554519: ClientVersion;
/** Windows 5.0.0-qa-puzzle-2-1, build 1723116226. */
export declare const Windows_5_0_0_qa_puzzle_2_1_1723116226: ClientVersion;
/** Windows 5.0.0-beta78-pre-1, build 1724839559. */
export declare const Windows_5_0_0_beta78_pre_1_1724839559: ClientVersion;
/** Windows 5.0.0-qa-78-18, build 1724924030. */
export declare const Windows_5_0_0_qa_78_18_1724924030: ClientVersion;
/** Windows 5.0.0-qa-78-19, build 1724930118. */
export declare const Windows_5_0_0_qa_78_19_1724930118: ClientVersion;
/** Windows 5.0.0-beta78-pre-2, build 1725011227. */
export declare const Windows_5_0_0_beta78_pre_2_1725011227: ClientVersion;
/** Windows 5.0.0-qa-78-20, build 1725620142. */
export declare const Windows_5_0_0_qa_78_20_1725620142: ClientVersion;
/** Windows 5.0.0-qa-78-21, build 1726235323. */
export declare const Windows_5_0_0_qa_78_21_1726235323: ClientVersion;
/** Windows 5.0.0-qa-78-22, build 1726816276. */
export declare const Windows_5_0_0_qa_78_22_1726816276: ClientVersion;
/** Windows 5.0.0-qa-78-23, build 1727272684. */
export declare const Windows_5_0_0_qa_78_23_1727272684: ClientVersion;
/** Windows 5.0.0-beta78-pre-5, build 1728287639. */
export declare const Windows_5_0_0_beta78_pre_5_1728287639: ClientVersion;
/** Windows 6.0.0-beta2, build 1737468425. */
export declare const Windows_6_0_0_beta2_1737468425: ClientVersion;
/** Windows 3.?.?, build 5680278000. */
export declare const Windows_3_X_X_5680278000: ClientVersion;
/** Windows 3.?.?, build 5680278000 DEBUG. */
export declare const Windows_3_X_X_5680278000_DEBUG: ClientVersion;
/** Linux 3.?.?, build 5680278000. */
export declare const Linux_3_X_X_5680278000: ClientVersion;
/** OS X 3.?.?, build 5680278000. */
export declare const OSX_3_X_X_5680278000: ClientVersion;
/** Android 3.?.?, build 5680278000. */
export declare const Android_3_X_X_5680278000: ClientVersion;
/** iOS 3.?.?, build 5680278000. */
export declare const iOS_3_X_X_5680278000: ClientVersion;
//# sourceMappingURL=index.d.ts.map