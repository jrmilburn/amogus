/** Original code-native station artwork. Orthographic machinery, not UI icons.
 * Metal shells share the incumbent atlas palette; glass and labels identify purpose.
 */
const svg = (body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">${body}</svg>`;
const shell = (body: string) =>
  svg(
    `<rect x="16" y="25" width="228" height="224" rx="10" fill="#091219" opacity=".6"/><rect x="10" y="9" width="228" height="224" rx="10" fill="#536a73" stroke="#142831" stroke-width="7"/><path d="M24 22h198" stroke="#96a8a8" stroke-width="4"/>${body}`,
  );
const repeat = (n: number, f: (i: number) => string) =>
  Array.from({ length: n }, (_, i) => f(i)).join('');
const engineer = `<path d="M102 94h51l17 25-6 65-23 5-5-44h-13l-5 44-23-5-8-65z" fill="#829a9f" stroke="#243f4a" stroke-width="5"/><path d="M97 108l-15 30m76-30 16 30" stroke="#94a8a9" stroke-width="15"/><path d="M105 55l39-4 20 22-12 30-45-4-12-25z" fill="#bcc9c5" stroke="#324e58" stroke-width="5"/><path d="M110 64l29-3 13 14-7 10-34-2z" fill="#416f80"/><path d="M109 112h42v12h-42" fill="#b9b7a0"/><path d="M100 174h18m23 0h21" stroke="#344d58" stroke-width="8"/>`;

export const roomPropArtwork: Record<string, string> = {
  files: shell(
    repeat(
      4,
      (row) =>
        `<rect x="24" y="${37 + row * 46}" width="200" height="40" fill="#263d46"/>${repeat(9, (col) => `<path d="M${31 + col * 21} ${48 + row * 46}v23h17V${44 + row * 46}h-9l-3 4z" fill="${['#b5a988', '#8cabb0', '#b99873'][col % 3]}"/><path d="M${35 + col * 21} ${56 + row * 46}h8" stroke="#e1d7b8" stroke-width="3"/>`)}<path d="M23 ${78 + row * 46}h202" stroke="#a0aca5" stroke-width="4"/>`,
    ),
  ),
  servers: shell(
    repeat(
      5,
      (i) =>
        `<rect x="26" y="${34 + i * 37}" width="196" height="31" rx="3" fill="#1a303b" stroke="#748991" stroke-width="2"/><path d="M44 ${43 + i * 37}h104m-104 7h104m-104 7h104" stroke="#465e6a" stroke-width="3"/><circle cx="186" cy="${49 + i * 37}" r="4" fill="#99ddcc"/><circle cx="202" cy="${49 + i * 37}" r="4" fill="#e6a65a"/>`,
    ),
  ),
  relay: svg(
    `<ellipse cx="130" cy="164" rx="106" ry="78" fill="#091219" opacity=".6"/><path d="M79 230l31-103h36l31 103" fill="#647983" stroke="#1a303c" stroke-width="8"/><ellipse cx="126" cy="105" rx="108" ry="78" fill="#9bacac" stroke="#304d5c" stroke-width="8"/><ellipse cx="126" cy="103" rx="82" ry="57" fill="#4f7585" stroke="#b4c9c8" stroke-width="3"/><path d="M24 103h205M126 29v151M51 53l150 101M48 151 204 55" stroke="#9eafb1" stroke-width="4"/><path d="M126 104 158 19" stroke="#263e4a" stroke-width="10"/><circle cx="158" cy="19" r="9" fill="#e6a65a"/><rect x="91" y="201" width="69" height="22" rx="4" fill="#182e39"/><path d="M102 211h46" stroke="#99ddcc" stroke-width="4"/>`,
  ),
  cryopod: svg(
    `<rect x="53" y="15" width="160" height="235" rx="48" fill="#081922" opacity=".6"/><rect x="43" y="5" width="160" height="232" rx="47" fill="#768f99" stroke="#244854" stroke-width="8"/><rect x="56" y="25" width="134" height="178" rx="38" fill="#274f64"/>${engineer}<rect x="56" y="25" width="134" height="178" rx="38" fill="#a4e7e6" opacity=".25" stroke="#bfe5df" stroke-width="4"/><path d="M72 48 169 154M64 78l109 108M88 36l32 33" stroke="#d5f2e9" stroke-width="5" opacity=".5"/><path d="M54 49h17m-16 31h12m113 75h16m-19 27h16" stroke="#d5f2e9" stroke-width="7"/><rect x="81" y="211" width="85" height="13" rx="4" fill="#163847"/><path d="M90 217h40m10 0h14" stroke="#a9e6d8" stroke-width="4"/>`,
  ),
  engine: svg(
    `<rect x="10" y="55" width="242" height="172" rx="15" fill="#091219" opacity=".6"/><path d="M8 72h240v111H8z" fill="#354a56" stroke="#152831" stroke-width="8"/><rect x="39" y="38" width="175" height="171" rx="35" fill="#72868b" stroke="#243b48" stroke-width="8"/><rect x="64" y="53" width="126" height="138" rx="24" fill="#263e4d"/>${repeat(7, (i) => `<path d="M${71 + i * 17} 61v124" stroke="#80989d" stroke-width="8"/>`)}<rect x="81" y="98" width="96" height="47" rx="13" fill="#9c6943" stroke="#dca15f" stroke-width="5"/><path d="M94 115h70m-70 11h70" stroke="#f4c788" stroke-width="5"/><path d="M33 41V19h66m91 183v31h-70" fill="none" stroke="#b08d62" stroke-width="14"/><circle cx="37" cy="191" r="20" fill="#526e7b" stroke="#a0b4b6" stroke-width="5"/><path d="M22 191h30m-15-15v30" stroke="#d4b476" stroke-width="5"/>`,
  ),
  suits: shell(
    `<path d="M24 37h198v180H24z" fill="#203640"/>${repeat(3, (i) => `<g transform="translate(${i * 69 - 23} 16) scale(.53 .94)">${engineer}</g>`)}<path d="M88 32v186M158 32v186" stroke="#9cafad" stroke-width="4"/><path d="M32 210h42m24 0h42m24 0h42" stroke="#d4c392" stroke-width="6"/>`,
  ),
  supplies: shell(
    repeat(
      3,
      (row) =>
        `<path d="M24 ${83 + row * 65}h200" stroke="#9cacaa" stroke-width="6"/>${repeat(4, (col) => `<rect x="${30 + col * 48}" y="${35 + row * 65}" width="40" height="43" rx="4" fill="${row === 0 ? '#ac9871' : row === 1 ? '#78989a' : '#b18467'}" stroke="#263d48" stroke-width="3"/><rect x="${39 + col * 48}" y="${47 + row * 65}" width="22" height="14" fill="#ddd5b7"/><path d="M${43 + col * 48} ${53 + row * 65}h14m-14 4h10" stroke="#52696e" stroke-width="2"/>`)}`,
    ),
  ),
  scrubber: svg(
    `<path d="M16 50h224v192H16z" fill="#091219" opacity=".6"/><path d="M23 41h47m119 0h45M39 39v178h54m91 0h40V39" fill="none" stroke="#768f8f" stroke-width="18"/>${repeat(2, (i) => `<rect x="${53 + i * 86}" y="22" width="69" height="198" rx="30" fill="#607f85" stroke="#213d49" stroke-width="6"/><rect x="${67 + i * 86}" y="47" width="41" height="104" rx="17" fill="#284855"/>${repeat(6, (j) => `<path d="M${73 + i * 86} ${58 + j * 15}h29" stroke="#9cc4b7" stroke-width="5"/>`)}<circle cx="${87 + i * 86}" cy="183" r="19" fill="#203944" stroke="#c3b893" stroke-width="4"/><path d="M${87 + i * 86} 183l8-8" stroke="#e6a65a" stroke-width="4"/>`)}<path d="M7 90h24m192 52h25" stroke="#b2c4bd" stroke-width="12"/>`,
  ),
  cleaning: shell(
    `<rect x="27" y="33" width="90" height="151" rx="13" fill="#325862" stroke="#90b4b1" stroke-width="5"/><path d="M40 62h64m-64 22h64m-64 22h64m-64 22h64" stroke="#173b48" stroke-width="8"/><circle cx="72" cy="154" r="18" fill="#c5bb90"/><path d="M156 44v145m40-145v145" stroke="#b6c6be" stroke-width="8"/><path d="M133 181h45v24h-45zM180 181h39v24h-39z" fill="#7da49c"/><path d="M133 205h45m2 0h39" stroke="#d1d5b3" stroke-width="12"/><circle cx="45" cy="218" r="10" fill="#152c37"/><circle cx="200" cy="218" r="10" fill="#152c37"/>`,
  ),
  switchboard: shell(
    `<rect x="23" y="32" width="202" height="184" fill="#263e4a"/>${repeat(3, (row) => repeat(4, (col) => `<rect x="${33 + col * 47}" y="${43 + row * 57}" width="36" height="46" rx="4" fill="#799197" stroke="#142e3d" stroke-width="3"/><rect x="${46 + col * 47}" y="${51 + row * 57}" width="10" height="25" fill="#1b3441"/><path d="M${42 + col * 47} ${58 + row * 57}h18" stroke="${col % 2 ? '#e6a65a' : '#a0d7bf'}" stroke-width="7"/>`))}<path d="M28 226h192" stroke="#b29d72" stroke-width="5"/>`,
  ),
  bench: svg(
    `<rect x="14" y="30" width="230" height="207" rx="16" fill="#0b202a" opacity=".55"/><rect x="17" y="15" width="222" height="202" rx="14" fill="#65757a" stroke="#203943" stroke-width="7"/><rect x="30" y="30" width="196" height="125" rx="8" fill="#a4aaa0"/><path d="M41 45h170m-170 15h170" stroke="#858f88" stroke-width="3"/><path d="M39 172h178v32H39z" fill="#476470"/><path d="M60 173v31m45-31v31m45-31v31m45-31v31" stroke="#76908e" stroke-width="4"/><circle cx="177" cy="103" r="20" fill="#d2c7a4"/><circle cx="177" cy="103" r="13" fill="#54757c"/><path d="M54 84h52v37H54z" fill="#c2b38d"/>`,
  ),
  samples: shell(
    `<rect x="25" y="29" width="197" height="123" rx="7" fill="#b7c1b5"/>${repeat(5, (i) => `<rect x="${35 + i * 36}" y="56" width="22" height="69" rx="9" fill="#315567"/><rect x="${40 + i * 36}" y="84" width="12" height="33" rx="5" fill="${['#9dd0ba', '#d2b883', '#b3a6bd'][i % 3]}"/><path d="M${33 + i * 36} 54h26" stroke="#7b8e98" stroke-width="8"/>`)}<rect x="29" y="168" width="125" height="44" rx="5" fill="#203b48"/><path d="M39 183h90m-90 12h59" stroke="#99ddcc" stroke-width="4"/><circle cx="187" cy="190" r="18" fill="#e6a65a"/>`,
  ),
  access: shell(
    `<rect x="30" y="30" width="186" height="65" rx="7" fill="#1b3945"/><path d="M46 51h95m-95 15h121" stroke="#99ddcc" stroke-width="5"/>${repeat(3, (r) => repeat(3, (c) => `<rect x="${36 + c * 39}" y="${115 + r * 31}" width="27" height="21" rx="3" fill="#9aadae"/>`))}<rect x="168" y="110" width="43" height="99" rx="6" fill="#1c3440"/><path d="M178 121v77" stroke="#e6a65a" stroke-width="4"/>`,
  ),
  reactor: svg(
    `<circle cx="132" cy="135" r="118" fill="#091219" opacity=".6"/><circle cx="125" cy="123" r="111" fill="#71888e" stroke="#243f4d" stroke-width="9"/><circle cx="125" cy="123" r="82" fill="#1c3d50" stroke="#acc4be" stroke-width="8"/>${repeat(8, (i) => `<path d="M116 15h18v41h-18z" fill="#a4aaa0" transform="rotate(${i * 45} 125 123)"/>`)}<circle cx="125" cy="123" r="52" fill="#5caba9"/><circle cx="125" cy="123" r="31" fill="#b6e4d5"/><path d="M71 89h108m-116 22h126m-125 22h125m-110 22h98" stroke="#2d5664" stroke-width="5"/>`,
  ),
};
