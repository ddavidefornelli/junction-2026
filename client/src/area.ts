// What the customer's postal code tells about where they live, from open data:
// what rent costs there and who lives there. Used for the "Your area" card and
// by Walter. Only the public figures live here; the customer's postal code is
// looked up in this file and never sent anywhere.
//
// Sources (all Statistics Finland, fetched 14 November 2026):
// - Rents: "Rents of dwellings" (asvu), table 15fa, 2026Q3, average rent per m²
//   of non-subsidised (free-market) rental flats, all tenancies.
//   https://pxdata.stat.fi/PxWeb/pxweb/en/StatFin/StatFin__asvu/statfin_asvu_pxt_15fa.px/
// - Rent zones: Helsinki is split into four zones by price level. The postal
//   codes in each come from Statistics Finland's area division of 7 August 2019
//   (https://stat.fi/til/asvu/asvu_2019-08-07_luo_001.pdf), the newest list
//   published. Espoo and Vantaa are also split into zones, but no current list of
//   their postal codes is published, so they use the city-wide figure. The towns
//   around Helsinki use the "satellite municipalities" figure (Siuntio is not one
//   of them officially; it is the nearest published figure).
// - Neighbourhoods: Paavo, open data by postal code area, published 2026, data
//   for 2024, table 12f7: floor area per person, household size, households
//   renting and living alone, median disposable income of inhabitants (a year).
//   https://pxdata.stat.fi/PxWeb/pxweb/en/Postinumeroalueittainen_avoin_tieto/

export const RENT_PERIOD = 'July–September 2026'
export const AREA_SOURCE = 'Statistics Finland: rents July–September 2026, postal code area data for 2024'

type Zone = '091_1' | '091_2' | '091_3' | '091_4' | '091' | '049' | '092' | 'keh'

// Euros per m² a month: all flats, one-room, two-room, three rooms or more.
export const RENTS: Record<Zone, { label: string; all: number; one: number; two: number; three: number }> = {
  '091_1': { label: 'Helsinki zone 1, the southern inner city', all: 24.52, one: 29.03, two: 24.19, three: 21.44 },
  '091_2': { label: 'Helsinki zone 2', all: 22.23, one: 26.73, two: 21.02, three: 19.07 },
  '091_3': { label: 'Helsinki zone 3', all: 19.86, one: 26.26, two: 18.5, three: 17.37 },
  '091_4': { label: 'Helsinki zone 4', all: 17.84, one: 23.83, two: 17.2, three: 15.68 },
  '091': { label: 'Helsinki', all: 21.37, one: 26.7, two: 20.38, three: 18.42 },
  '049': { label: 'Espoo and Kauniainen', all: 18.86, one: 23.83, two: 18.3, three: 17.1 },
  '092': { label: 'Vantaa', all: 17.78, one: 22.98, two: 16.94, three: 15.53 },
  keh: { label: 'the towns around Helsinki', all: 15.28, one: 18.96, two: 14.51, three: 13.59 },
}

type Area = {
  name: string
  city: string
  zone: Zone
  m2PerPerson: number // average floor area per resident
  householdSize: number // average people per household
  renters: number // share of households renting, 0–1
  livingAlone: number // share of one-person households, 0–1
  medianIncome: number // median disposable income of residents aged 18+, euros a year
}

const AREAS: Record<string, Area> = {
  '00100': { name: "Helsinki keskusta - Etu-Töölö", city: 'Helsinki', zone: '091_1', m2PerPerson: 39.4, householdSize: 1.7, renters: 0.508, livingAlone: 0.526, medianIncome: 34408 },
  '00120': { name: "Punavuori - Bulevardi", city: 'Helsinki', zone: '091_1', m2PerPerson: 39.9, householdSize: 1.8, renters: 0.462, livingAlone: 0.504, medianIncome: 35106 },
  '00140': { name: "Kaivopuisto - Ullanlinna", city: 'Helsinki', zone: '091_1', m2PerPerson: 42.7, householdSize: 1.7, renters: 0.443, livingAlone: 0.522, medianIncome: 36332 },
  '00150': { name: "Punavuori - Eira - Hernesaari", city: 'Helsinki', zone: '091_1', m2PerPerson: 35.1, householdSize: 1.6, renters: 0.485, livingAlone: 0.595, medianIncome: 32750 },
  '00160': { name: "Katajanokka", city: 'Helsinki', zone: '091_1', m2PerPerson: 40.1, householdSize: 1.9, renters: 0.473, livingAlone: 0.425, medianIncome: 34808 },
  '00170': { name: "Kruununhaka", city: 'Helsinki', zone: '091_1', m2PerPerson: 39, householdSize: 1.8, renters: 0.447, livingAlone: 0.489, medianIncome: 35405 },
  '00180': { name: "Kamppi - Ruoholahti", city: 'Helsinki', zone: '091_1', m2PerPerson: 33.5, householdSize: 1.8, renters: 0.605, livingAlone: 0.51, medianIncome: 30624 },
  '00200': { name: "Pohjois-Lauttasaari", city: 'Helsinki', zone: '091_2', m2PerPerson: 33.8, householdSize: 1.8, renters: 0.417, livingAlone: 0.515, medianIncome: 35619 },
  '00210': { name: "Vattuniemi", city: 'Helsinki', zone: '091_2', m2PerPerson: 36, householdSize: 1.9, renters: 0.325, livingAlone: 0.435, medianIncome: 37916 },
  '00220': { name: "Jätkäsaari", city: 'Helsinki', zone: '091_1', m2PerPerson: 30.1, householdSize: 1.9, renters: 0.737, livingAlone: 0.478, medianIncome: 31735 },
  '00240': { name: "Länsi-Pasila", city: 'Helsinki', zone: '091_3', m2PerPerson: 32.1, householdSize: 1.8, renters: 0.656, livingAlone: 0.508, medianIncome: 30182 },
  '00250': { name: "Taka-Töölö", city: 'Helsinki', zone: '091_2', m2PerPerson: 33.7, householdSize: 1.6, renters: 0.525, livingAlone: 0.59, medianIncome: 32339 },
  '00260': { name: "Keski-Töölö", city: 'Helsinki', zone: '091_1', m2PerPerson: 39.2, householdSize: 1.7, renters: 0.478, livingAlone: 0.54, medianIncome: 33827 },
  '00270': { name: "Pohjois-Meilahti", city: 'Helsinki', zone: '091_2', m2PerPerson: 33.1, householdSize: 1.6, renters: 0.562, livingAlone: 0.609, medianIncome: 31224 },
  '00280': { name: "Ruskeasuo", city: 'Helsinki', zone: '091_2', m2PerPerson: 31.9, householdSize: 1.7, renters: 0.51, livingAlone: 0.571, medianIncome: 29698 },
  '00300': { name: "Pikku Huopalahti", city: 'Helsinki', zone: '091_2', m2PerPerson: 34.1, householdSize: 1.9, renters: 0.657, livingAlone: 0.504, medianIncome: 29037 },
  '00320': { name: "Etelä-Haaga", city: 'Helsinki', zone: '091_2', m2PerPerson: 32, householdSize: 1.6, renters: 0.535, livingAlone: 0.644, medianIncome: 31333 },
  '00330': { name: "Munkkiniemi", city: 'Helsinki', zone: '091_2', m2PerPerson: 39.2, householdSize: 1.8, renters: 0.428, livingAlone: 0.509, medianIncome: 36005 },
  '00340': { name: "Kuusisaari - Lehtisaari", city: 'Helsinki', zone: '091_2', m2PerPerson: 52.1, householdSize: 2.3, renters: 0.254, livingAlone: 0.322, medianIncome: 40673 },
  '00350': { name: "Munkkivuori - Niemenmäki", city: 'Helsinki', zone: '091_3', m2PerPerson: 32.2, householdSize: 1.7, renters: 0.557, livingAlone: 0.575, medianIncome: 30611 },
  '00360': { name: "Pajamäki", city: 'Helsinki', zone: '091_3', m2PerPerson: 30.9, householdSize: 1.6, renters: 0.446, livingAlone: 0.592, medianIncome: 29636 },
  '00370': { name: "Reimarla", city: 'Helsinki', zone: '091_3', m2PerPerson: 33.4, householdSize: 1.9, renters: 0.567, livingAlone: 0.468, medianIncome: 28411 },
  '00380': { name: "Pitäjänmäen yritysalue", city: 'Helsinki', zone: '091_2', m2PerPerson: 33.4, householdSize: 1.7, renters: 0.705, livingAlone: 0.541, medianIncome: 29048 },
  '00390': { name: "Konala", city: 'Helsinki', zone: '091_4', m2PerPerson: 33.6, householdSize: 1.9, renters: 0.446, livingAlone: 0.498, medianIncome: 28988 },
  '00400': { name: "Pohjois-Haaga", city: 'Helsinki', zone: '091_3', m2PerPerson: 31.1, householdSize: 1.7, renters: 0.588, livingAlone: 0.583, medianIncome: 26909 },
  '00410': { name: "Malminkartano", city: 'Helsinki', zone: '091_4', m2PerPerson: 31.4, householdSize: 2, renters: 0.629, livingAlone: 0.444, medianIncome: 25291 },
  '00420': { name: "Kannelmäki", city: 'Helsinki', zone: '091_4', m2PerPerson: 32.1, householdSize: 1.8, renters: 0.572, livingAlone: 0.528, medianIncome: 25097 },
  '00430': { name: "Maununneva - Kuninkaantammi", city: 'Helsinki', zone: '091_3', m2PerPerson: 34.3, householdSize: 2.2, renters: 0.455, livingAlone: 0.353, medianIncome: 32524 },
  '00440': { name: "Lassila", city: 'Helsinki', zone: '091_3', m2PerPerson: 33.5, householdSize: 1.7, renters: 0.481, livingAlone: 0.576, medianIncome: 27029 },
  '00500': { name: "Sörnäinen - Harju", city: 'Helsinki', zone: '091_2', m2PerPerson: 29.8, householdSize: 1.3, renters: 0.661, livingAlone: 0.739, medianIncome: 25961 },
  '00510': { name: "Alppila - Vallila", city: 'Helsinki', zone: '091_2', m2PerPerson: 29.8, householdSize: 1.4, renters: 0.572, livingAlone: 0.693, medianIncome: 28727 },
  '00520': { name: "Itä- ja Keski-Pasila", city: 'Helsinki', zone: '091_2', m2PerPerson: 30.7, householdSize: 1.8, renters: 0.535, livingAlone: 0.516, medianIncome: 29589 },
  '00530': { name: "Kallio", city: 'Helsinki', zone: '091_2', m2PerPerson: 31.7, householdSize: 1.5, renters: 0.569, livingAlone: 0.666, medianIncome: 28216 },
  '00540': { name: "Kalasatama - Sompasaari", city: 'Helsinki', zone: '091_2', m2PerPerson: 31.3, householdSize: 1.9, renters: 0.606, livingAlone: 0.441, medianIncome: 33876 },
  '00550': { name: "Vallila - Hermanni", city: 'Helsinki', zone: '091_2', m2PerPerson: 30.3, householdSize: 1.5, renters: 0.645, livingAlone: 0.633, medianIncome: 27455 },
  '00560': { name: "Toukola - Kumpula - Vanhakaupunki", city: 'Helsinki', zone: '091_2', m2PerPerson: 32, householdSize: 1.9, renters: 0.577, livingAlone: 0.466, medianIncome: 30416 },
  '00570': { name: "Kulosaari", city: 'Helsinki', zone: '091_2', m2PerPerson: 41.8, householdSize: 2.1, renters: 0.335, livingAlone: 0.421, medianIncome: 36639 },
  '00580': { name: "Kalasatama - Kyläsaari", city: 'Helsinki', zone: '091_2', m2PerPerson: 30.9, householdSize: 1.7, renters: 0.648, livingAlone: 0.535, medianIncome: 31202 },
  '00590': { name: "Kruunuvuorenranta", city: 'Helsinki', zone: '091_2', m2PerPerson: 32.1, householdSize: 1.9, renters: 0.635, livingAlone: 0.455, medianIncome: 31537 },
  '00600': { name: "Koskela", city: 'Helsinki', zone: '091_4', m2PerPerson: 33.1, householdSize: 1.8, renters: 0.666, livingAlone: 0.533, medianIncome: 26753 },
  '00610': { name: "Käpylä", city: 'Helsinki', zone: '091_2', m2PerPerson: 31.8, householdSize: 1.8, renters: 0.558, livingAlone: 0.525, medianIncome: 30536 },
  '00620': { name: "Metsälä - Etelä-Oulunkylä", city: 'Helsinki', zone: '091_3', m2PerPerson: 39.5, householdSize: 2, renters: 0.31, livingAlone: 0.433, medianIncome: 32683 },
  '00630': { name: "Maunula", city: 'Helsinki', zone: '091_4', m2PerPerson: 34.2, householdSize: 1.7, renters: 0.643, livingAlone: 0.574, medianIncome: 27292 },
  '00640': { name: "Oulunkylä - Patola", city: 'Helsinki', zone: '091_4', m2PerPerson: 36.1, householdSize: 1.9, renters: 0.474, livingAlone: 0.503, medianIncome: 30089 },
  '00650': { name: "Veräjämäki", city: 'Helsinki', zone: '091_3', m2PerPerson: 35, householdSize: 2, renters: 0.572, livingAlone: 0.451, medianIncome: 30719 },
  '00660': { name: "Länsi-Pakila", city: 'Helsinki', zone: '091_3', m2PerPerson: 39.9, householdSize: 2.4, renters: 0.118, livingAlone: 0.273, medianIncome: 37827 },
  '00670': { name: "Paloheinä", city: 'Helsinki', zone: '091_3', m2PerPerson: 39.6, householdSize: 2.5, renters: 0.066, livingAlone: 0.202, medianIncome: 39653 },
  '00680': { name: "Itä-Pakila", city: 'Helsinki', zone: '091_3', m2PerPerson: 40.6, householdSize: 2.5, renters: 0.13, livingAlone: 0.24, medianIncome: 38196 },
  '00690': { name: "Torpparinmäki", city: 'Helsinki', zone: '091_3', m2PerPerson: 37.3, householdSize: 2.6, renters: 0.232, livingAlone: 0.233, medianIncome: 34919 },
  '00700': { name: "Malmi", city: 'Helsinki', zone: '091_4', m2PerPerson: 32.2, householdSize: 1.9, renters: 0.6, livingAlone: 0.509, medianIncome: 25468 },
  '00710': { name: "Pihlajamäki - Viikinmäki", city: 'Helsinki', zone: '091_4', m2PerPerson: 33.2, householdSize: 1.9, renters: 0.589, livingAlone: 0.514, medianIncome: 25614 },
  '00720': { name: "Pukinmäki", city: 'Helsinki', zone: '091_4', m2PerPerson: 33.2, householdSize: 1.9, renters: 0.546, livingAlone: 0.505, medianIncome: 26624 },
  '00730': { name: "Tapanila", city: 'Helsinki', zone: '091_3', m2PerPerson: 35.4, householdSize: 2.1, renters: 0.417, livingAlone: 0.39, medianIncome: 31584 },
  '00740': { name: "Siltamäki", city: 'Helsinki', zone: '091_4', m2PerPerson: 35.4, householdSize: 2.2, renters: 0.349, livingAlone: 0.349, medianIncome: 28916 },
  '00750': { name: "Tapulikaupunki", city: 'Helsinki', zone: '091_4', m2PerPerson: 33.8, householdSize: 2.2, renters: 0.494, livingAlone: 0.401, medianIncome: 27457 },
  '00760': { name: "Puistola - Heikinlaakso", city: 'Helsinki', zone: '091_4', m2PerPerson: 37.8, householdSize: 2.4, renters: 0.207, livingAlone: 0.26, medianIncome: 32975 },
  '00770': { name: "Jakomäki - Alppikylä", city: 'Helsinki', zone: '091_4', m2PerPerson: 32.6, householdSize: 2, renters: 0.727, livingAlone: 0.485, medianIncome: 24368 },
  '00780': { name: "Tapaninvainio", city: 'Helsinki', zone: '091_3', m2PerPerson: 39.1, householdSize: 2.1, renters: 0.27, livingAlone: 0.389, medianIncome: 31894 },
  '00790': { name: "Viikki", city: 'Helsinki', zone: '091_3', m2PerPerson: 30.4, householdSize: 2.1, renters: 0.7, livingAlone: 0.453, medianIncome: 27465 },
  '00800': { name: "Länsi-Herttoniemi", city: 'Helsinki', zone: '091_3', m2PerPerson: 32.9, householdSize: 1.7, renters: 0.644, livingAlone: 0.577, medianIncome: 28249 },
  '00810': { name: "Herttoniemenranta", city: 'Helsinki', zone: '091_2', m2PerPerson: 33.8, householdSize: 1.8, renters: 0.677, livingAlone: 0.491, medianIncome: 29420 },
  '00820': { name: "Roihuvuori", city: 'Helsinki', zone: '091_4', m2PerPerson: 31.2, householdSize: 1.7, renters: 0.578, livingAlone: 0.559, medianIncome: 26905 },
  '00830': { name: "Tammisalo", city: 'Helsinki', zone: '091_3', m2PerPerson: 45.7, householdSize: 2.4, renters: 0.097, livingAlone: 0.273, medianIncome: 42006 },
  '00840': { name: "Yliskylä", city: 'Helsinki', zone: '091_3', m2PerPerson: 38.1, householdSize: 1.9, renters: 0.318, livingAlone: 0.462, medianIncome: 32053 },
  '00850': { name: "Jollas", city: 'Helsinki', zone: '091_2', m2PerPerson: 41.1, householdSize: 2.6, renters: 0.29, livingAlone: 0.21, medianIncome: 36868 },
  '00870': { name: "Gunillanmäki - Hevossalmi", city: 'Helsinki', zone: '091_4', m2PerPerson: 33.8, householdSize: 2, renters: 0.689, livingAlone: 0.47, medianIncome: 27496 },
  '00890': { name: "Östersundom", city: 'Helsinki', zone: '091_4', m2PerPerson: 63.3, householdSize: 2.6, renters: 0.078, livingAlone: 0.163, medianIncome: 36664 },
  '00900': { name: "Puotinharju", city: 'Helsinki', zone: '091_4', m2PerPerson: 32.2, householdSize: 1.8, renters: 0.584, livingAlone: 0.547, medianIncome: 24210 },
  '00910': { name: "Puotila", city: 'Helsinki', zone: '091_4', m2PerPerson: 32.9, householdSize: 1.7, renters: 0.558, livingAlone: 0.587, medianIncome: 26477 },
  '00920': { name: "Myllypuro", city: 'Helsinki', zone: '091_4', m2PerPerson: 34.4, householdSize: 2, renters: 0.567, livingAlone: 0.461, medianIncome: 27715 },
  '00930': { name: "Itäkeskus - Marjaniemi", city: 'Helsinki', zone: '091_4', m2PerPerson: 37.6, householdSize: 2.1, renters: 0.556, livingAlone: 0.436, medianIncome: 25642 },
  '00940': { name: "Kontula - Vesala - Kivikko", city: 'Helsinki', zone: '091_4', m2PerPerson: 31.4, householdSize: 2, renters: 0.67, livingAlone: 0.487, medianIncome: 23045 },
  '00950': { name: "Vartioharju", city: 'Helsinki', zone: '091_3', m2PerPerson: 38, householdSize: 2.2, renters: 0.268, livingAlone: 0.327, medianIncome: 32778 },
  '00960': { name: "Pohjois-Vuosaari", city: 'Helsinki', zone: '091_4', m2PerPerson: 34.9, householdSize: 1.8, renters: 0.485, livingAlone: 0.536, medianIncome: 27478 },
  '00970': { name: "Mellunmäki", city: 'Helsinki', zone: '091_4', m2PerPerson: 34.3, householdSize: 1.8, renters: 0.572, livingAlone: 0.531, medianIncome: 25650 },
  '00980': { name: "Etelä-Vuosaari", city: 'Helsinki', zone: '091_4', m2PerPerson: 33.8, householdSize: 1.9, renters: 0.642, livingAlone: 0.483, medianIncome: 25263 },
  '00990': { name: "Aurinkolahti", city: 'Helsinki', zone: '091_2', m2PerPerson: 34.7, householdSize: 1.8, renters: 0.531, livingAlone: 0.488, medianIncome: 29524 },
  '01120': { name: "Västerskog", city: 'Sipoo', zone: 'keh', m2PerPerson: 53.3, householdSize: 2.4, renters: 0.064, livingAlone: 0.253, medianIncome: 33731 },
  '01150': { name: "Söderkulla", city: 'Sipoo', zone: 'keh', m2PerPerson: 42.1, householdSize: 2.1, renters: 0.399, livingAlone: 0.421, medianIncome: 31244 },
  '01190': { name: "Box", city: 'Sipoo', zone: 'keh', m2PerPerson: 51, householdSize: 2.4, renters: 0.047, livingAlone: 0.232, medianIncome: 32232 },
  '01200': { name: "Hakunila", city: 'Vantaa', zone: '092', m2PerPerson: 32, householdSize: 2, renters: 0.631, livingAlone: 0.487, medianIncome: 24068 },
  '01230': { name: "Vaarala", city: 'Vantaa', zone: '092', m2PerPerson: 36.8, householdSize: 2.2, renters: 0.241, livingAlone: 0.367, medianIncome: 30908 },
  '01260': { name: "Itä-Hakkila", city: 'Vantaa', zone: '092', m2PerPerson: 40.9, householdSize: 2.5, renters: 0.152, livingAlone: 0.224, medianIncome: 32258 },
  '01280': { name: "Länsimäki", city: 'Vantaa', zone: '092', m2PerPerson: 33.3, householdSize: 2.1, renters: 0.435, livingAlone: 0.415, medianIncome: 26673 },
  '01300': { name: "Tikkurila", city: 'Vantaa', zone: '092', m2PerPerson: 34.4, householdSize: 1.8, renters: 0.57, livingAlone: 0.529, medianIncome: 27931 },
  '01340': { name: "Leinelä", city: 'Vantaa', zone: '092', m2PerPerson: 30.8, householdSize: 1.7, renters: 0.794, livingAlone: 0.51, medianIncome: 27104 },
  '01350': { name: "Hiekkaharju", city: 'Vantaa', zone: '092', m2PerPerson: 34.3, householdSize: 2, renters: 0.471, livingAlone: 0.473, medianIncome: 28108 },
  '01360': { name: "Koivukylä-Havukoski", city: 'Vantaa', zone: '092', m2PerPerson: 32.1, householdSize: 2, renters: 0.555, livingAlone: 0.496, medianIncome: 23609 },
  '01370': { name: "Jokiniemi", city: 'Vantaa', zone: '092', m2PerPerson: 30.5, householdSize: 1.9, renters: 0.693, livingAlone: 0.496, medianIncome: 26053 },
  '01380': { name: "Kuusikko-Hakkila", city: 'Vantaa', zone: '092', m2PerPerson: 36.9, householdSize: 2.6, renters: 0.232, livingAlone: 0.2, medianIncome: 32983 },
  '01390': { name: "Ruskeasanta-Ilola", city: 'Vantaa', zone: '092', m2PerPerson: 38.1, householdSize: 2.4, renters: 0.244, livingAlone: 0.254, medianIncome: 32781 },
  '01400': { name: "Rekola", city: 'Vantaa', zone: '092', m2PerPerson: 35.6, householdSize: 2.1, renters: 0.528, livingAlone: 0.42, medianIncome: 27767 },
  '01420': { name: "Päiväkumpu", city: 'Vantaa', zone: '092', m2PerPerson: 41.5, householdSize: 2.7, renters: 0.107, livingAlone: 0.163, medianIncome: 32360 },
  '01450': { name: "Korso", city: 'Vantaa', zone: '092', m2PerPerson: 36.8, householdSize: 2.1, renters: 0.4, livingAlone: 0.407, medianIncome: 28250 },
  '01480': { name: "Mikkola", city: 'Vantaa', zone: '092', m2PerPerson: 35.6, householdSize: 2.1, renters: 0.413, livingAlone: 0.419, medianIncome: 26779 },
  '01490': { name: "Nikinmäki", city: 'Vantaa', zone: '092', m2PerPerson: 40.9, householdSize: 2.8, renters: 0.094, livingAlone: 0.172, medianIncome: 34171 },
  '01510': { name: "Kirkonkylä-Veromäki", city: 'Vantaa', zone: '092', m2PerPerson: 30.6, householdSize: 2, renters: 0.67, livingAlone: 0.471, medianIncome: 28856 },
  '01520': { name: "Tammisto", city: 'Vantaa', zone: '092', m2PerPerson: 31.7, householdSize: 2.2, renters: 0.517, livingAlone: 0.377, medianIncome: 32815 },
  '01530': { name: "Veromiehenkylä", city: 'Vantaa', zone: '092', m2PerPerson: 27.3, householdSize: 1.9, renters: 0.962, livingAlone: 0.448, medianIncome: 24992 },
  '01600': { name: "Myyrmäki", city: 'Vantaa', zone: '092', m2PerPerson: 32.6, householdSize: 1.8, renters: 0.551, livingAlone: 0.552, medianIncome: 25475 },
  '01610': { name: "Kaivoksela", city: 'Vantaa', zone: '092', m2PerPerson: 34.1, householdSize: 1.7, renters: 0.531, livingAlone: 0.569, medianIncome: 27456 },
  '01620': { name: "Martinlaakso", city: 'Vantaa', zone: '092', m2PerPerson: 32.3, householdSize: 1.9, renters: 0.515, livingAlone: 0.498, medianIncome: 25956 },
  '01640': { name: "Hämevaara", city: 'Vantaa', zone: '092', m2PerPerson: 38.3, householdSize: 2.1, renters: 0.421, livingAlone: 0.385, medianIncome: 30818 },
  '01660': { name: "Varisto", city: 'Vantaa', zone: '092', m2PerPerson: 37.9, householdSize: 2.2, renters: 0.362, livingAlone: 0.347, medianIncome: 29587 },
  '01670': { name: "Vantaanlaakso", city: 'Vantaa', zone: '092', m2PerPerson: 38.1, householdSize: 2.3, renters: 0.153, livingAlone: 0.263, medianIncome: 33804 },
  '01690': { name: "Ylästö", city: 'Vantaa', zone: '092', m2PerPerson: 37.5, householdSize: 2.8, renters: 0.152, livingAlone: 0.145, medianIncome: 37792 },
  '01700': { name: "Kivistö", city: 'Vantaa', zone: '092', m2PerPerson: 31.5, householdSize: 1.8, renters: 0.709, livingAlone: 0.533, medianIncome: 27568 },
  '01710': { name: "Pähkinärinne", city: 'Vantaa', zone: '092', m2PerPerson: 34.3, householdSize: 1.8, renters: 0.452, livingAlone: 0.532, medianIncome: 27804 },
  '01730': { name: "Vantaanpuisto", city: 'Vantaa', zone: '092', m2PerPerson: 40.1, householdSize: 2.3, renters: 0.122, livingAlone: 0.328, medianIncome: 31172 },
  '01750': { name: "Keimola", city: 'Vantaa', zone: '092', m2PerPerson: 48.6, householdSize: 2.5, renters: 0.048, livingAlone: 0.22, medianIncome: 32490 },
  '01800': { name: "Klaukkala Keskus", city: 'Nurmijärvi', zone: 'keh', m2PerPerson: 38.6, householdSize: 2, renters: 0.428, livingAlone: 0.457, medianIncome: 29822 },
  '01820': { name: "Haikala", city: 'Nurmijärvi', zone: 'keh', m2PerPerson: 42.4, householdSize: 2.4, renters: 0.163, livingAlone: 0.229, medianIncome: 32800 },
  '01840': { name: "Klaukkala", city: 'Nurmijärvi', zone: 'keh', m2PerPerson: 44.2, householdSize: 2.5, renters: 0.163, livingAlone: 0.233, medianIncome: 32970 },
  '01860': { name: "Perttula", city: 'Nurmijärvi', zone: 'keh', m2PerPerson: 51, householdSize: 2.5, renters: 0.035, livingAlone: 0.243, medianIncome: 31791 },
  '01900': { name: "Nurmijärvi Keskus", city: 'Nurmijärvi', zone: 'keh', m2PerPerson: 43.4, householdSize: 2, renters: 0.351, livingAlone: 0.455, medianIncome: 29075 },
  '02100': { name: "Tapiola", city: 'Espoo', zone: '049', m2PerPerson: 37.9, householdSize: 1.7, renters: 0.456, livingAlone: 0.536, medianIncome: 34967 },
  '02110': { name: "Otsolahti", city: 'Espoo', zone: '049', m2PerPerson: 35.6, householdSize: 1.9, renters: 0.412, livingAlone: 0.476, medianIncome: 34296 },
  '02120': { name: "Länsikorkee-Suvikumpu", city: 'Espoo', zone: '049', m2PerPerson: 36.7, householdSize: 1.8, renters: 0.385, livingAlone: 0.52, medianIncome: 34817 },
  '02130': { name: "Pohjois-Tapiola", city: 'Espoo', zone: '049', m2PerPerson: 38.4, householdSize: 2.2, renters: 0.273, livingAlone: 0.351, medianIncome: 38711 },
  '02140': { name: "Laajalahti", city: 'Espoo', zone: '049', m2PerPerson: 37.5, householdSize: 2.6, renters: 0.251, livingAlone: 0.233, medianIncome: 37056 },
  '02150': { name: "Otaniemi", city: 'Espoo', zone: '049', m2PerPerson: 21.7, householdSize: 1.9, renters: 0.94, livingAlone: 0.499, medianIncome: 12135 },
  '02160': { name: "Westend", city: 'Espoo', zone: '049', m2PerPerson: 51.6, householdSize: 2.4, renters: 0.129, livingAlone: 0.265, medianIncome: 47267 },
  '02170': { name: "Haukilahti", city: 'Espoo', zone: '049', m2PerPerson: 42.4, householdSize: 2.1, renters: 0.308, livingAlone: 0.403, medianIncome: 37904 },
  '02180': { name: "Mankkaa", city: 'Espoo', zone: '049', m2PerPerson: 38.3, householdSize: 2.7, renters: 0.154, livingAlone: 0.202, medianIncome: 41646 },
  '02200': { name: "Niittykumpu", city: 'Espoo', zone: '049', m2PerPerson: 34.2, householdSize: 1.8, renters: 0.585, livingAlone: 0.508, medianIncome: 31780 },
  '02210': { name: "Olari", city: 'Espoo', zone: '049', m2PerPerson: 36.8, householdSize: 1.9, renters: 0.396, livingAlone: 0.465, medianIncome: 31556 },
  '02230': { name: "Matinkylä", city: 'Espoo', zone: '049', m2PerPerson: 35, householdSize: 2, renters: 0.543, livingAlone: 0.456, medianIncome: 29405 },
  '02240': { name: "Friisilä", city: 'Espoo', zone: '049', m2PerPerson: 45.1, householdSize: 2.3, renters: 0.285, livingAlone: 0.306, medianIncome: 38519 },
  '02250': { name: "Henttaa", city: 'Espoo', zone: '049', m2PerPerson: 29.6, householdSize: 2, renters: 0.803, livingAlone: 0.481, medianIncome: 26872 },
  '02260': { name: "Kaitaa", city: 'Espoo', zone: '049', m2PerPerson: 38.6, householdSize: 2.2, renters: 0.378, livingAlone: 0.342, medianIncome: 32171 },
  '02270': { name: "Finnoo-Eestinmalmi", city: 'Espoo', zone: '049', m2PerPerson: 33.7, householdSize: 2, renters: 0.618, livingAlone: 0.433, medianIncome: 29413 },
  '02300': { name: "Nöykkiönpuro", city: 'Espoo', zone: '049', m2PerPerson: 46.2, householdSize: 2.8, renters: 0.063, livingAlone: 0.143, medianIncome: 40331 },
  '02320': { name: "Espoonlahti", city: 'Espoo', zone: '049', m2PerPerson: 36.3, householdSize: 1.9, renters: 0.473, livingAlone: 0.474, medianIncome: 28823 },
  '02330': { name: "Saunalahti-Kattilalaakso", city: 'Espoo', zone: '049', m2PerPerson: 37.9, householdSize: 2.2, renters: 0.502, livingAlone: 0.409, medianIncome: 32290 },
  '02340': { name: "Latokaski", city: 'Espoo', zone: '049', m2PerPerson: 35.1, householdSize: 2.6, renters: 0.182, livingAlone: 0.206, medianIncome: 35295 },
  '02360': { name: "Soukka", city: 'Espoo', zone: '049', m2PerPerson: 40.3, householdSize: 2.1, renters: 0.34, livingAlone: 0.385, medianIncome: 30994 },
  '02380': { name: "Suvisaaristo", city: 'Espoo', zone: '049', m2PerPerson: 73.3, householdSize: 2.4, renters: 0.051, livingAlone: 0.257, medianIncome: 37862 },
  '02390': { name: "Sarvvik", city: 'Kirkkonummi', zone: 'keh', m2PerPerson: 39.4, householdSize: 1.7, renters: 0.577, livingAlone: 0.555, medianIncome: 33098 },
  '02400': { name: "Kirkkonummi Keskus", city: 'Kirkkonummi', zone: 'keh', m2PerPerson: 42.4, householdSize: 2, renters: 0.419, livingAlone: 0.421, medianIncome: 29030 },
  '02410': { name: "Gesterby", city: 'Kirkkonummi', zone: 'keh', m2PerPerson: 39, householdSize: 1.7, renters: 0.508, livingAlone: 0.571, medianIncome: 23691 },
  '02420': { name: "Jorvas", city: 'Kirkkonummi', zone: 'keh', m2PerPerson: 59.6, householdSize: 2.4, renters: 0.061, livingAlone: 0.225, medianIncome: 34113 },
  '02430': { name: "Masala", city: 'Kirkkonummi', zone: 'keh', m2PerPerson: 33.6, householdSize: 2, renters: 0.588, livingAlone: 0.479, medianIncome: 26980 },
  '02460': { name: "Kantvik", city: 'Kirkkonummi', zone: 'keh', m2PerPerson: 44.5, householdSize: 2.2, renters: 0.282, livingAlone: 0.364, medianIncome: 32198 },
  '02470': { name: "Upinniemi", city: 'Kirkkonummi', zone: 'keh', m2PerPerson: 43.1, householdSize: 1.5, renters: 0.935, livingAlone: 0.562, medianIncome: 27029 },
  '02480': { name: "Porkkala", city: 'Kirkkonummi', zone: 'keh', m2PerPerson: 47.7, householdSize: 2.5, renters: 0.202, livingAlone: 0.232, medianIncome: 34373 },
  '02520': { name: "Lapinkylä", city: 'Kirkkonummi', zone: 'keh', m2PerPerson: 53.5, householdSize: 2.4, renters: 0.042, livingAlone: 0.243, medianIncome: 31479 },
  '02540': { name: "Kylmälä", city: 'Kirkkonummi', zone: 'keh', m2PerPerson: 54.7, householdSize: 2.4, renters: 0.053, livingAlone: 0.263, medianIncome: 30839 },
  '02550': { name: "Evitskog", city: 'Kirkkonummi', zone: 'keh', m2PerPerson: 51.6, householdSize: 2.4, renters: 0.056, livingAlone: 0.269, medianIncome: 29284 },
  '02570': { name: "Siuntio Kirkonkylä", city: 'Siuntio', zone: 'keh', m2PerPerson: 51.9, householdSize: 2.2, renters: 0.091, livingAlone: 0.333, medianIncome: 30213 },
  '02580': { name: "Siuntio Asemanseutu", city: 'Siuntio', zone: 'keh', m2PerPerson: 50.7, householdSize: 2.3, renters: 0.189, livingAlone: 0.317, medianIncome: 30299 },
  '02600': { name: "Etelä-Leppävaara", city: 'Espoo', zone: '049', m2PerPerson: 30.6, householdSize: 1.9, renters: 0.732, livingAlone: 0.499, medianIncome: 27766 },
  '02610': { name: "Kilo", city: 'Espoo', zone: '049', m2PerPerson: 30.3, householdSize: 2.3, renters: 0.643, livingAlone: 0.401, medianIncome: 27149 },
  '02620': { name: "Karakallio", city: 'Espoo', zone: '049', m2PerPerson: 35.6, householdSize: 2.2, renters: 0.45, livingAlone: 0.41, medianIncome: 29922 },
  '02630': { name: "Nihtisilta", city: 'Espoo', zone: '049', m2PerPerson: 32, householdSize: 2.1, renters: 0.556, livingAlone: 0.415, medianIncome: 29973 },
  '02650': { name: "Pohjois-Leppävaara", city: 'Espoo', zone: '049', m2PerPerson: 33.6, householdSize: 1.8, renters: 0.521, livingAlone: 0.517, medianIncome: 30086 },
  '02660': { name: "Lintuvaara", city: 'Espoo', zone: '049', m2PerPerson: 35.8, householdSize: 2.7, renters: 0.33, livingAlone: 0.227, medianIncome: 35237 },
  '02680': { name: "Uusmäki", city: 'Espoo', zone: '049', m2PerPerson: 33.6, householdSize: 2.4, renters: 0.372, livingAlone: 0.323, medianIncome: 38122 },
  '02700': { name: "Kauniainen", city: 'Kauniainen', zone: '049', m2PerPerson: 48.2, householdSize: 2.3, renters: 0.298, livingAlone: 0.347, medianIncome: 38714 },
  '02710': { name: "Viherlaakso", city: 'Espoo', zone: '049', m2PerPerson: 38.5, householdSize: 2, renters: 0.285, livingAlone: 0.443, medianIncome: 31984 },
  '02720': { name: "Lähderanta", city: 'Espoo', zone: '049', m2PerPerson: 38, householdSize: 2.1, renters: 0.238, livingAlone: 0.405, medianIncome: 32031 },
  '02730': { name: "Jupperi", city: 'Espoo', zone: '049', m2PerPerson: 47.3, householdSize: 2.7, renters: 0.019, livingAlone: 0.159, medianIncome: 39981 },
  '02740': { name: "Bemböle-Pakankylä", city: 'Espoo', zone: '049', m2PerPerson: 38.2, householdSize: 2.4, renters: 0.474, livingAlone: 0.293, medianIncome: 32122 },
  '02760': { name: "Tuomarila-Suvela", city: 'Espoo', zone: '049', m2PerPerson: 30.8, householdSize: 2.3, renters: 0.498, livingAlone: 0.39, medianIncome: 27445 },
  '02770': { name: "Espoon Keskus", city: 'Espoo', zone: '049', m2PerPerson: 32.6, householdSize: 2.1, renters: 0.623, livingAlone: 0.438, medianIncome: 26218 },
  '02780': { name: "Kauklahti", city: 'Espoo', zone: '049', m2PerPerson: 35.9, householdSize: 2.5, renters: 0.437, livingAlone: 0.295, medianIncome: 34221 },
  '02810': { name: "Gumböle-Karhusuo", city: 'Espoo', zone: '049', m2PerPerson: 39.5, householdSize: 2.7, renters: 0.178, livingAlone: 0.223, medianIncome: 36381 },
  '02820': { name: "Nupuri-Nuuksio", city: 'Espoo', zone: '049', m2PerPerson: 46.2, householdSize: 2.5, renters: 0.084, livingAlone: 0.237, medianIncome: 33924 },
  '02880': { name: "Veikkola", city: 'Kirkkonummi', zone: 'keh', m2PerPerson: 46.1, householdSize: 2.5, renters: 0.121, livingAlone: 0.234, medianIncome: 34362 },
  '02920': { name: "Niipperi", city: 'Espoo', zone: '049', m2PerPerson: 37.6, householdSize: 2.7, renters: 0.263, livingAlone: 0.2, medianIncome: 34807 },
  '02940': { name: "Lippajärvi-Järvenperä", city: 'Espoo', zone: '049', m2PerPerson: 37.3, householdSize: 2.2, renters: 0.4, livingAlone: 0.381, medianIncome: 32260 },
  '02970': { name: "Kalajärvi", city: 'Espoo', zone: '049', m2PerPerson: 42, householdSize: 2.5, renters: 0.216, livingAlone: 0.24, medianIncome: 33843 },
}

export type AreaView = Area & {
  code: string
  zoneLabel: string
  rentPerM2: number // all flats in the zone
  rentOne: number // one-room flats, per m²
  rentTwo: number // two-room flats, per m²
  // What one person typically pays to rent here: the zone's rent per m² times
  // the floor area residents have per person in this postal code.
  typicalRent: number
  housing: number | null // the customer's housing payment, euros a month
  m2ForPayment: number | null // the floor area their payment rents here
  income: number | null // the customer's income, euros a month
  housingShare: number | null // housing / income
  medianIncomeMonthly: number
}

// What the open data says about a postal code, next to the customer's own
// housing payment and income (euros a month; null when the account has none).
// Null for a postal code the data does not cover.
export function makeArea(code: string | null, housing: number | null, income: number | null): AreaView | null {
  const area = code ? AREAS[code] : undefined
  if (!code || !area) return null
  const rent = RENTS[area.zone]
  const paid = housing && housing > 0 ? housing : null
  const earned = income && income > 0 ? income : null
  return {
    ...area,
    code,
    zoneLabel: rent.label,
    rentPerM2: rent.all,
    rentOne: rent.one,
    rentTwo: rent.two,
    typicalRent: rent.all * area.m2PerPerson,
    housing: paid,
    m2ForPayment: paid && paid / rent.all,
    income: earned,
    housingShare: paid && earned ? paid / earned : null,
    medianIncomeMonthly: area.medianIncome / 12,
  }
}
