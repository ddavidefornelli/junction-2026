# Spending insights: what we built and what it rests on

Working notes for the plan, the reference-budget comparison and the "Where you
could pay less" card. Written 14 November 2026. Update it when the logic or a
source changes.

## 1. What the dataset gives us

Profiled from the full `tx_junction_transactions.csv` (3.6M rows, 5,100 customers).

- **Categories**: Groceries, Restaurants, Transportation, Entertainment, Health,
  Home & Tech, Lifestyle, Travel, Utilities, Housing, plus income and investment rows.
- **MCC codes**: 36 standard ISO 18245 codes, each belonging to one category.
  2–12% of purchases in a category have no MCC (12% in Transportation).
- **Merchant ids**: 515 anonymous ids such as `MRC-GRO-0035`, each tied to one
  category and one MCC. They carry no usable signal:
  - the average ticket is the same at every merchant of a kind (every
    supermarket averages about €68–72);
  - every merchant is used by customers from almost every postal code, so
    there is no location.
- **Amounts are not real prices**: the average taxi payment is about €45 and the
  average convenience-store payment about €69. So we apply published
  *percentages* to a customer's own spending and never quote ticket prices as theirs.
- **Customers**: all postal codes are in the Helsinki capital region (00xxx–02xxx).

## 2. Decisions so far

| Decision | Why |
|---|---|
| Merchant id is not used | No price or location signal. A first version invented shop names and €/€€/€€€ price levels per id; it was removed because nothing in it was real. |
| MCC is used | It splits a category into essential and optional parts, and names the kind of place. |
| Reference budgets define "tight" | An official Finnish figure for what a household needs, instead of our own threshold. |
| Tips carry a figure only when a Finnish source gives one | Butcher and fuel tips have no euro figure because no published comparison was found. |
| Laya's verdicts are unchanged | Still by category and transaction type. Its prompts were tuned by measurement, so asking it about MCCs needs a re-test. |
| The reference budget is a floor on cuts | No group of budgets is cut below the reasonable minimum for the household. This lowers how much a plan can free, and so the paces the goal form offers. |

## 3. How it works

### 3.1 MCC on a transaction (`client/src/mcc.ts`)

- Each purchase row shows the kind of place ("Taxi", "Pharmacy", "Supermarket").
- Some kinds are budgeted apart from their category:

| MCC | Kind | Budget line | Largest cut |
|---|---|---|---|
| 4121 | Taxi | Taxis | 50% |
| 5813 | Bar | Bars | 50% |
| 5499 | Convenience store | Convenience stores | 30% |
| 5912, 8011, 8021, 8099 | Pharmacy, doctor, dentist, health service | none | never budgeted or flagged |

The cut limits (50%, 30%) are our own judgement, not sourced. Every other MCC
stays inside its category's budget; purchases with no MCC follow the category rule.

### 3.2 Reference budgets (`client/src/refbudget.ts`)

The published rows are grouped to match the bank's categories:

| Our group | Published rows | Bank categories |
|---|---|---|
| Food, including eating out | Ruoka | Groceries, Restaurants |
| Clothing | Vaatteet, kengät, asusteet | Lifestyle with MCC 5651 or 5691 |
| Leisure, hobbies and travel | Vapaa-aika ja harrastukset | Entertainment, Travel, rest of Lifestyle |
| Health and hygiene | Terveydenhoito + Hygienia ja kauneudenhoito | Health |
| Home, tech and telecoms | Tietoliikenne + kestotavarat + käyttötavarat | Home & Tech |
| Getting around | Liikkuminen, pääkaupunkiseutu | Transportation |

Housing, electricity and insurance are left out: the plan never budgets them.

The household comes from the goal form (adults and children). Ages and sex are
not asked, so where the published budgets differ the more generous one is used:

| Customer says | Reference household used | Exact? |
|---|---|---|
| 1 adult | Single under 45, mean of man and woman | yes |
| 2 adults | Couple, both 50 | yes |
| 1 adult, 1 child | One parent, child 14 | yes |
| 1 adult, 2 children | One parent, children 10 and 13 | yes |
| 1 adult, 3+ children | One parent, children 10 and 13 | closest |
| 2 adults, 1 child | Two parents, children 2 and 6 | closest |
| 2 adults, 2 children | Two parents, children 4 and 10 | yes |
| 2 adults, 3+ children | Two parents, three teenagers | yes |
| 3+ adults, or not given | none: no comparison | – |

"Getting around" is dropped when the customer commutes by car, because the
published figure assumes public transport.

### 3.3 Floor and tight plan (`client/src/plan.ts`)

**Floor.** For each group in 3.2, the budget lines in it can together give up
no more than what the customer spends above the reference amount. If they
spend €419 on food and the minimum is €284, groceries, restaurants, bars and
convenience stores can give up €135 between them at most, shared in proportion
to each line's own cut limit. A group already under its minimum is not cut at
all. Lines outside every group, and customers with no household, keep the old
limits. For "Spend less" with no amount, the 10% cut shrinks to what the floor
allows.

Checked with CUST00002 as one adult: transport spending (€73) is under the
minimum (€96), so the Transportation budget went from €51 back to the usual
€64 and Taxis from €4 to €9.

A plan is **tight** when either is true:

- the goal is out of reach even with every budget cut to its limit; or
- the plan leaves the compared groups, taken together, within 10% of the
  reference budget (this includes customers already below it).

The 10% margin is our own choice. Without a household there is no reference,
and only the first rule applies.

### 3.4 Tips (`client/src/mcc.ts`, card "Where you could pay less")

Computed from the last three full months. A tip with a figure needs at least
€5 a month of saving; a tip without one needs at least €20 a month of spending.

| Kind (MCC) | Tip | Saving applied | Shown | Source |
|---|---|---|---|---|
| Convenience store (5499) | Hypermarket instead | 16% | always | ruoanhinta.fi, 8/2026 |
| Taxi (4121) | Public transport instead | 75% | always | Traficom 6/2024; HSL 2026 |
| Restaurant (5812) | One meal in four at home | 80% of a quarter of the spend | tight only | Helsingin Sanomat; reference budgets 2025 |
| Staffed service station (5541) | Self-service pump | no figure | tight only | Iltalehti 7/2022 |
| Butcher (5422) | Compare price per kilo with supermarket meat | no figure | tight only | none found |

## 4. Sources and the figures taken from them

### Reference budgets (the backbone)

Kuluttajatutkimuskeskus, University of Helsinki: *Kohtuullisen minimin
viitebudjetit*, tables 1 and 2, published 19.11.2025. Euros a month, 2025.

- Tables: https://www.sttinfo.fi/files/3747/71619537/296749/fi
- Press release: https://www.helsinki.fi/fi/uutiset/yhteiskunta-ja-oppiminen/tuoreet-laskelmat-kertovat-milla-rahamaaralla-kotitaloudet-voivat-tulla-toimeen
- Method notes from the release: food follows a two-week meal plan based on the
  nutrition recommendations; prices are averages of typically three affordable
  products; capital-region households are budgeted without a car.

| Household | Food | Clothing | Telecoms | Durables | Consumables | Hygiene | Health | Leisure | Mobility (capital region) |
|---|---|---|---|---|---|---|---|---|---|
| Single man under 45 | 312 | 58 | 93 | 32 | 22 | 40 | 22 | 48 | 96 |
| Single woman under 45 | 256 | 53 | 93 | 32 | 22 | 52 | 30 | 48 | 96 |
| Single man over 65 | 278 | 48 | 93 | 32 | 22 | 40 | 39 | 48 | 65 |
| Single woman over 65 | 224 | 47 | 93 | 32 | 22 | 51 | 39 | 48 | 65 |
| Couple, 50 | 567 | 111 | 132 | 39 | 32 | 82 | 47 | 97 | 184 |
| Couple, 50 and 65 | 534 | 101 | 132 | 39 | 32 | 81 | 59 | 97 | 153 |
| Couple, over 65 | 502 | 95 | 132 | 39 | 33 | 82 | 76 | 97 | 122 |
| One parent, child 3 | 349 | 119 | 93 | 40 | 31 | 56 | 35 | 54 | 103 |
| One parent, child 14 | 459 | 125 | 132 | 41 | 33 | 74 | 36 | 100 | 139 |
| One parent, children 10 and 13 | 635 | 194 | 172 | 57 | 44 | 91 | 42 | 165 | 179 |
| Two parents, children 2 and 6 | 807 | 236 | 138 | 63 | 48 | 99 | 55 | 118 | 194 |
| Two parents, children 4 and 10 | 844 | 245 | 172 | 64 | 48 | 104 | 55 | 159 | 231 |
| Two parents, two teenagers | 1020 | 268 | 207 | 64 | 48 | 129 | 57 | 195 | 269 |
| Two parents, three teenagers | 1210 | 339 | 242 | 68 | 55 | 144 | 63 | 260 | 309 |

Not used in code yet: the over-65 rows, "couple 50 and 65", "one parent, child
3", "two teenagers", and the housing and electricity rows. Note: Takuusäätiö's
summary card for "one parent, child 3" shows leisure 61 where the university
table shows 54; the code follows the university table.

### Price comparisons

| Topic | Figure | Source | Caveat |
|---|---|---|---|
| Convenience store vs hypermarket | Average 24-product basket: K-Market €78.28, Prisma €65.78 (511 stores, 10 cities, updated 3.8.2026) | https://ruoanhinta.fi/tilastot/ruokakorin-hinta-kaupungeittain | Could not confirm who runs the site |
| Same, older | 34 branded products, Feb 2019: Lidl €57.33; K-Market +19%, Alepa and Sale +20%, Prisma +0.5% | https://www.verkkouutiset.fi/a/kl-lidl-yha-ruokakorivertailun-halvin/ | 2019; reported second-hand from Kauppalehti |
| Taxi | 10 km trip, June 2024: €13–20 by app, typically €30–35 otherwise | https://moottori.fi/uutinen/sovellukset-hillinneet-taksikyytien-hintoja-toteaa-traficom/ | Traficom figures reported by Moottori |
| Public transport | HSL AB single ticket €3.30 in 2026 (€3.35 from 1.1.2027); 30-day AB ticket €73.90 | https://www.verkkouutiset.fi/a/hsl-paatti-lippujen-hinnat-nousevat/ | 30-day price inferred from the 2027 increase |
| Restaurant lunch | About €15 in the capital region; lunch benefit maximum €14 | https://www.verkkouutiset.fi/a/lounas-maksaa-jo-15-euroa-hs-ravintolalle-jaa-vain-sentteja/ | Article date not confirmed |
| Meal at home | About €3: reference food budget €256–312 a month over three meals a day | our calculation from the reference budgets | Derived, not published |
| Fuel | Self-service stations cheaper on average (no figure); 5–10 cents a litre between stations in one city; 95 E10 averaged €2.3 a litre in Oct 2026 | https://www.verkkouutiset.fi/a/il-tama-on-edullisin-huoltoasemaketju/ and https://stat.fi/fi/julkaisu/cmfb0gbb42xi207w5rys9z903 | Ranking is from 2022 |

### Looked for and not found

- **Butcher vs supermarket**: no Finnish comparison. The only figures point the
  other way for direct farm sales (about €17/kg against €25/kg in shops for the
  same mince): https://yle.fi/a/74-20248915
- **Pharmacies**: since April 2022 pharmacies may price over-the-counter
  medicines between a floor and a maximum, but no figure for the spread:
  https://www.verkkouutiset.fi/a/apteekkarit-vastaavat-taman-takia-laakkeet-ovat-suomessa-kalliimpia/
- **Bars vs shop prices**, **store brands vs brands**: direction is clear, no
  current percentage. KKV's 2025 store-brand report:
  https://www.kkv.fi/uploads/sites/2/2025-03-tutkimusraportteja-kaupan-omat-merkit-eli-private-label-tuotteet-elintarvikemarkkinoilla.pdf

## 5. What is our own assumption, in one place

- Cut limits per kind: taxis and bars 50%, convenience stores 30%.
- Tight margin: within 10% of the reference budget.
- "One restaurant meal in four" as the realistic share to move home.
- All taxi and convenience-store spending is treated as movable.
- The grouping of published rows to bank categories (section 3.2).
- The household matching where ages and sex are unknown (section 3.2).
- Tip thresholds: €5 a month saving, €20 a month spending, three-month window.

## 6. Open questions

- With the floor in place, some goals that were reachable are now out of
  reach. Is the "out of reach" message enough, or should the plan suggest the
  nearest reachable date?
- Ask the customer's **age band and children's ages** to pick the exact
  reference household? The customer table already has `customer_age`.
- The butcher tip has no source. Keep it figure-less, drop it, or look for a
  price-per-kilo dataset?
- Use the MCC in **Laya's verdicts** (needs a re-test of its prompts).
- Name the cause on over-budget tags ("Taxis over budget").
- Reference budgets are 2025 prices and the transactions run to late 2026:
  index them with Statistics Finland's consumer price index?
