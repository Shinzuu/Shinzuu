// Renders the README activity graph (daily contributions, last 31 days) to an SVG.
// Replaces github-readme-activity-graph.vercel.app, whose public deployment went down.
// Usage: GITHUB_TOKEN=... node activity-graph.mjs <username> <out.svg>
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

const [user, out] = process.argv.slice(2);
const token = process.env.GITHUB_TOKEN;
if (!user || !out || !token) {
  console.error("usage: GITHUB_TOKEN=... node activity-graph.mjs <username> <out.svg>");
  process.exit(1);
}

const DAYS = 31;
const theme = { text: "#808080", line: "#8a0f0f", point: "#9a3410", area: "#8a0f0f" };

const to = new Date();
const from = new Date(to.getTime() - (DAYS - 1) * 864e5);
const query = `query($u:String!,$f:DateTime!,$t:DateTime!){user(login:$u){contributionsCollection(from:$f,to:$t){contributionCalendar{weeks{contributionDays{date contributionCount}}}}}}`;

const res = await fetch("https://api.github.com/graphql", {
  method: "POST",
  headers: { Authorization: `bearer ${token}`, "Content-Type": "application/json" },
  body: JSON.stringify({ query, variables: { u: user, f: from.toISOString(), t: to.toISOString() } }),
});
const json = await res.json();
if (!res.ok || json.errors) {
  console.error(JSON.stringify(json.errors ?? json));
  process.exit(1);
}
const days = json.data.user.contributionsCollection.contributionCalendar.weeks
  .flatMap((w) => w.contributionDays)
  .slice(-DAYS);

// Layout
const W = 1200, H = 420;
const pad = { top: 70, right: 40, bottom: 60, left: 70 };
const cw = W - pad.left - pad.right, ch = H - pad.top - pad.bottom;
const max = Math.max(4, ...days.map((d) => d.contributionCount));
const step = Math.ceil(max / 4);
const yMax = step * 4;
const x = (i) => pad.left + (i * cw) / (days.length - 1);
const y = (v) => pad.top + ch - (v * ch) / yMax;

const pts = days.map((d, i) => [x(i), y(d.contributionCount)]);
const line = pts.map(([px, py], i) => `${i ? "L" : "M"}${px.toFixed(1)},${py.toFixed(1)}`).join("");
const area = `${line}L${x(days.length - 1).toFixed(1)},${y(0)}L${x(0).toFixed(1)},${y(0)}Z`;

const grid = [0, 1, 2, 3, 4].map((k) => {
  const v = k * step, gy = y(v).toFixed(1);
  return `<line x1="${pad.left}" x2="${W - pad.right}" y1="${gy}" y2="${gy}" stroke="${theme.text}" stroke-opacity=".15"/>` +
    `<text x="${pad.left - 12}" y="${gy}" text-anchor="end" dominant-baseline="middle">${v}</text>`;
}).join("");

const labels = days.map((d, i) => `<text x="${x(i).toFixed(1)}" y="${H - pad.bottom + 24}" text-anchor="middle">${Number(d.date.slice(8))}</text>`).join("");
const dots = pts.map(([px, py], i) =>
  `<circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="4" fill="${theme.point}"><title>${days[i].date}: ${days[i].contributionCount}</title></circle>`).join("");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="Segoe UI, Ubuntu, sans-serif">
<g fill="${theme.text}" font-size="13">${grid}${labels}</g>
<text x="${W / 2}" y="36" text-anchor="middle" fill="${theme.text}" font-size="22" font-weight="600" letter-spacing="2">ACTIVITY</text>
<text x="${W / 2}" y="${H - 12}" text-anchor="middle" fill="${theme.text}" font-size="13">Days</text>
<text transform="translate(22 ${pad.top + ch / 2}) rotate(-90)" text-anchor="middle" fill="${theme.text}" font-size="13">Contributions</text>
<path d="${area}" fill="${theme.area}" fill-opacity=".25"/>
<path d="${line}" fill="none" stroke="${theme.line}" stroke-width="3" stroke-linejoin="round"/>
${dots}
</svg>
`;

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, svg);
console.log(`wrote ${out}: ${days.length} days, max ${max}`);
