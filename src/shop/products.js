// src/shop/products.js
// Product catalog for the Hardware Shop and Software Shop.
// Add or edit entries here — the gallery, detail modal, and cart all render from
// this list.  Prices in USD cents; `null` means TBD (reserve/notify flow only).

// Backend seam: SHOP_LIVE gates only the FINAL checkout submission and the
// notify-me email capture, which need the goods checkout endpoint. Everything
// else is live while false: the Hardware Shop, product modals, add to cart,
// preorder deposits, donations, the cart drawer, and the checkout review page.
// While false, "Place order" reads as coming soon and the cart stays saved on
// the device, so nothing is collected into a void.
export const SHOP_LIVE = false; // ← flip when the goods checkout endpoint is deployed

export const HARDWARE = [
  {
    id: 'omnisource',
    category: 'hardware',
    name: 'OmniSource',
    tagline: 'Pocket loop-power stick.',
    subtitle: 'Energize any 4-20mA / HART transmitter off a USB port.',
    image: '/docs/assets/products/omnisource/product.png',
    flyer: '/docs/assets/OmniSourceProductFlyer.png',
    gallery: [
      { src: '/docs/assets/products/omnisource/product.png', alt: 'OmniSource unit', kind: 'photo' },
      { src: '/docs/assets/products/omnisource/case.png', alt: 'OmniSource packed in its branded hard-shell case', kind: 'photo' },
      { src: '/docs/assets/products/omnisource/marketing.jpg', alt: 'Everything in the box: hard-shell case with paracord carabiner, OmniSource, wire harness, 2mm screwdriver, and warranty card', kind: 'photo' }
    ],
    // How-To video. The source file is too large to serve from the repo, so it
    // is hosted externally: set ONE of mp4 (a direct URL, e.g. Azure Blob) or
    // youtube (an unlisted video id). The player stays hidden until one is set.
    video: {
      title: 'How To: OmniSource',
      // No custom poster: YouTube supplies its own thumbnail. If a poster is
      // ever needed (e.g. a self-hosted mp4), use the marketing shot with all
      // components laid out: /docs/assets/products/omnisource/marketing.jpg
      poster: '',
      mp4: '',
      youtube: 'bCgHOtEVbxI'
    },
    // Warranty policy shown on the registration page. Each product carries its
    // own terms; OmniSource covers the printed case for life, one redemption a
    // year per device, clock starting at each redemption.
    warranty: {
      headline: 'Lifetime case warranty',
      lede: 'Your OmniSource case is covered for the life of the product. Here is how a redemption works.',
      terms: [
        'Covers the printed hard-shell case for the life of the product.',
        'One case redemption per year, per device. Each unit you own has its own coverage. The year runs from the date a redemption is engaged, not from purchase or registration, and it does not accrue: skipping a year does not bank a second redemption.',
        'A replacement ships with a new case and a new warranty card, physical and digital. Register the new card when it arrives: that keeps your coverage active for the next redemption.',
        'Shipping on a warranty replacement is the customer’s responsibility.',
        'Coverage does not expire. Bridges Industrial LLC reserves the right to deny, suspend, or void coverage in cases of fraud, abuse, misuse, or commercial exploitation, at its sole discretion. This warranty gives you specific legal rights; you may also have other rights that vary by jurisdiction.'
      ]
    },
    badge: 'First product',
    availability: 'available',
    priceCents: 2500,
    docs: {
      brochure:  '/docs/#doc=products/OmniSource-Brochure.md',
      technical: '/docs/#doc=products/OmniSource-Technical.md'
    },
    // Embedded model files. `image` is shown inline; `formats` populate the
    // glass download selector. Add STL/3MF here (as a separate `model` block)
    // when the enclosure files are ready — same pattern.
    schematic: {
      title: 'Schematic',
      image: '/docs/assets/products/omnisource/OmniSource_Schematic.png',
      download: '/docs/assets/products/omnisource/OmniSource_Schematic.pdf'
    },
    // The printable parts — three parts across two materials, each group with
    // its own glass file-type selector. Profiles live in print-profiles.json
    // (fetched and rendered as a styled table in the modal; also a download).
    model: {
      title: 'Print Files',
      image: '/docs/assets/products/omnisource/cad-view.png',
      note: 'Three printed parts, two materials. Every file is pre-oriented for resin printing: the enclosure and lid print unsupported; the case prints with its included supports.',
      profileDoc: { href: '/docs/#doc=products/OmniSource-Technical.md', label: 'Read the print profile: resin settings, plate, and release' },
      profilesJson: { href: '/docs/assets/products/omnisource/print/print-profiles.json', label: 'Print profiles · JSON' },
      groups: [
        {
          name: 'Enclosure + Lid',
          material: 'FR resin',
          supports: 'No supports needed',
          formats: [
            { ext: 'STL · both parts', label: 'Enclosure + Lid · STL', href: '/docs/assets/products/omnisource/enclosure/OmniSource.stl' },
            { ext: '3MF · enclosure',  label: 'Enclosure · 3MF',       href: '/docs/assets/products/omnisource/enclosure/OmniSource_Enclosure.3mf' },
            { ext: '3MF · lid',        label: 'Lid · 3MF',             href: '/docs/assets/products/omnisource/enclosure/OmniSource_Lid.3mf' }
          ]
        },
        {
          name: 'Case',
          material: 'Silicone-like resin',
          supports: 'Supported, supports included',
          formats: [
            { ext: 'STL', label: 'Case · STL', href: '/docs/assets/products/omnisource/case/OmniSource_Case.stl' },
            { ext: '3MF', label: 'Case · 3MF', href: '/docs/assets/products/omnisource/case/OmniSource_Case.3mf' }
          ]
        }
      ]
    },
    downloads: [
      { label: 'Brochure',      href: '/docs/#doc=products/OmniSource-Brochure.md', kind: 'link' },
      { label: 'Technical doc', href: '/docs/#doc=products/OmniSource-Technical.md', kind: 'link' },
      // The licence that governs every design download. Also copied into each
      // design folder so it travels with the files themselves.
      { label: 'Design licence · CC BY-NC-SA', href: '/docs/omni-LICENSE.md', kind: 'legal', legal: 'license' }
    ],
    kit: {
      title: "What's in the box",
      intro: 'Every OmniSource ships as a complete field-ready kit: pull it out of your bag, clip on, dial the voltage, done.',
      items: [
        {
          title: 'PragOptics carry case',
          body: 'Hard-shell pouch, ~2.76 × 2.76 × 1.18 inches, PragOptics logo on the lid, mesh pocket inside for the leads and stick, paracord carabiner attached for clipping to a tool bag or belt loop.'
        },
        {
          title: 'OmniSource stick with finger-loop lanyard',
          body: 'Assembled, tested, voltage-set to 25 V. The keyring hole carries a finger-loop lanyard so it stays with you when you clip on.'
        },
        {
          title: 'Test-lead harness',
          body: 'Center-positive barrel to two hook-style grabber clips (red +, black −). Bites onto instrument terminals without a screwdriver.'
        },
        {
          title: 'PragOptics 2mm slotted screwdriver',
          body: 'For the trimpot and the case screws, so you can retune the voltage or open the unit with nothing else on hand. PragOptics-branded while blades are in stock; an unbranded 2mm slotted driver ships when the branded blades are out.'
        },
        {
          title: 'Warranty & registration card',
          body: 'A unique registration code, one per device. Register within 30 days of purchase; the printed case is warranted for life.'
        }
      ]
    },
    features: [
      { title: 'Adjustable, not fixed',              body: 'Multiturn trimpot sets the loop voltage; ships set at 25 V (24 V typical), 28 V ceiling.' },
      { title: 'HART-friendly',                       body: '270 Ω series load lands inside the 230-600 Ω HART window.' },
      { title: 'Current-limited where it counts',    body: 'The 270 Ω resistor caps forward current to ~93 mA at 25 V (~104 mA at the 28 V ceiling) into any load. Output is touch-safe.' },
      { title: 'Self-resetting protection',          body: 'A Littelfuse 250R145 PTC (145 mA hold, 290 mA trip, 250 V interrupt) backstops an external fault and self-resets. No glass fuse to swap. A 10 µF cap steadies the output.' },
      { title: 'A handful of leaded parts, no SMD',  body: 'About an hour with a soldering iron.' },
      { title: 'Yours to open and repair',           body: 'Through-hole parts in a case that opens. Nothing potted, nothing locked. Open it to probe, retune the voltage, or swap a part. A tool you own, not a sealed black box.' }
    ],
    specs: [
      { k: 'Input',         v: '5V USB-A (power in, input only)' },
      { k: 'Output',        v: 'Center-positive DC barrel jack (loop out), voltage set by exposed trimpot' },
      { k: 'Loop voltage',  v: 'Adjustable, ships set at 25 V (24 V typical); 28 V ceiling' },
      { k: 'Loop load',     v: '270 Ω 3W, inside the 230-600 Ω HART window' },
      { k: 'Forward limit', v: '~93 mA at 25 V, ~104 mA at the 28 V ceiling (set by the 270 Ω)' },
      { k: 'Protection',    v: '270 Ω current cap + self-resetting Littelfuse 250R145 PTC (145 mA hold, 290 mA trip, 250 V interrupt) + 10 µF output cap, no glass fuse' },
      { k: 'Isolation',     v: 'None (non-isolated, floating ground) by design' },
      { k: 'Build',         v: 'A handful of leaded / through-hole parts, no SMD, ~1 hour to solder' },
      { k: 'Case',          v: 'Printable, STL included' },
      { k: 'Scope',         v: 'Sources loop power only' }
    ],
    variants: [
      { id: 'kit', name: 'Assembled kit', priceCents: 2500,
        note: 'PragOptics carry case + OmniSource stick w/ finger-loop lanyard + test-lead harness w/ hook grabbers. Voltage-set to 25 V, ready to clip on. Printed case warranted for life; register within 30 days.' }
    ],
    license: 'Source-available, not open source. The full design is free to build from: exact parts, schematic, and case STL, as many as you like. Build one for yourself or your employer, but not for resale, and firmware stays proprietary. Published under CC BY-NC-SA 4.0; the full licence travels with every download. Buy one built for convenience, or build your own: both are first-class.'
  },
  {
    id: 'omnibus',
    category: 'hardware',
    name: 'OmniBus',
    tagline: 'Universal HART field node.',
    subtitle: 'Vendor-neutral HART communicator, calibration recorder, and audit node in one rugged handheld.',
    image: '/docs/assets/OmniBusProductFlyer.png',
    gallery: [
      { src: '/docs/assets/OmniBusProductFlyer.png', alt: 'OmniBus product flyer', kind: 'flyer' }
    ],
    badge: 'Flagship',
    availability: 'coming-soon',
    priceCents: 150000,
    preorder: { depositCents: 50000, balanceCents: 100000 },
    docs: {
      brochure: '/docs/#doc=OmniBus-Brochure.md'
    },
    downloads: [
      { label: 'Brochure', href: '/docs/#doc=OmniBus-Brochure.md', kind: 'link' }
    ],
    features: [
      { title: 'Any HART instrument',    body: 'Any vendor, over USB HART, on-board two-wire loop, HART-IP, or Wi-Fi.' },
      { title: 'On-board 4-20 mA measure', body: 'Measures the loop current directly on board. No separate meter.' },
      { title: 'As-Found / As-Left records', body: 'Every connection is a guided calibration record with an auto-generated certificate.' },
      { title: 'Audit trail',            body: 'Append-only ledger. Every field touch is traceable.' }
    ],
    specs: [
      { k: 'Scope', v: 'Universal HART communicator + calibration recorder + field audit node' },
      { k: 'Modes', v: 'USB HART, on-board two-wire loop, HART-IP, Wi-Fi' },
      { k: 'Vendor lock', v: 'None. Vendor-neutral across manufacturers' }
    ],
    variants: [
      { id: 'preorder', name: 'Preorder: $500 deposit', priceCents: 50000,
        note: '$500 deposit reserves your OmniBus. $1,000 balance is due when it ships. Fully refundable until then.' }
    ]
  }
];

export const SOFTWARE = [
  {
    id: 'pragoptics-platform',
    category: 'software',
    name: 'PragOptics™ Platform',
    tagline: 'One subscription. Every app.',
    icon: '/images/logo.png',
    splash: '/images/logo.png',
    splashFit: 'contain',
    subtitle: 'Not an app: the one subscription that powers all of them. Every PragOptics app downloads free and runs on its own. This adds the server side they all share, so your data and API features follow you from app to app. Start it once and it works across everything on this page.',
    availability: 'available',
    access: 'subscription',
    priceLabel: 'Subscription',
    action: { kind: 'wizard', label: 'Start subscription' },
    features: [
      'One subscription covers every PragOptics app',
      'Cloud storage and sync for your app data',
      'API-backed features in every app that has them',
      'Token-based API access and custom endpoints',
      'Usage-based billing: pay for API calls and storage, not seats',
      'No subscription needed to keep using the free apps'
    ]
  },
  {
    id: 'pragoptics-studio',
    category: 'software',
    name: 'PragOptics',
    tagline: 'The main platform engine.',
    subtitle: 'The flagship app: a full production studio where you grab any element on a live canvas and shape it in place, or drop into raw code with a real repository tree. Websites, web apps, and code notebooks: one engine, AI assistance built in, and everything you make exports free.',
    icon: '/docs/assets/products/pragoptics/icon.png',
    splash: '/docs/assets/products/pragoptics/splash.png',
    splashAspect: '1024 / 450',
    availability: 'coming-soon',
    access: 'free',
    priceLabel: 'Free to start',
    action: { kind: 'notify', label: 'Notify me at launch' },
    features: [
      'Direct-manipulation canvas: click, drag, and edit every element in place',
      'Raw code mode with a real repo tree, syntax highlighting, and live preview',
      'Three project kinds on one engine: websites, web apps, and code notebooks',
      'Notebook cells run JavaScript, HTML, and Python right in the browser',
      'AI-assisted building: describe a section, restyle by prompt',
      'Your work is yours: free export, one-click publish, pay only as you grow'
    ]
  },
  {
    id: 'pragoptics-3d-suite',
    category: 'software',
    name: 'PragOptics 3D Suite',
    tagline: 'Model and slice, in one place.',
    subtitle: 'A FreeCAD modeling core and a PrusaSlicer slicing engine in a single app: design a part and send it straight to the printer without switching tools.',
    icon: '/docs/assets/products/3d-suite/icon.png',
    splash: '/docs/assets/products/3d-suite/splash.png',
    splashAspect: '16 / 9',
    availability: 'coming-soon',
    access: 'free',
    priceLabel: 'Free',
    action: { kind: 'notify', label: 'Notify me at launch' },
    features: [
      'FreeCAD parametric modeling',
      'PrusaSlicer slicing engine built in',
      'Print-setting profiles for PragOptics hardware',
      'Free download'
    ]
  },
  {
    id: 'fnm',
    category: 'software',
    name: 'Field Node Manager',
    tagline: 'Free desktop companion for OmniBus.',
    subtitle: 'Drive your OmniBus from the desk, view it live, and exchange data over SSH or the cloud.',
    icon: '/docs/assets/products/fnm/logo.png',
    splash: '/docs/assets/products/fnm/splash.png',
    splashAspect: '1403 / 640',
    availability: 'available',
    access: 'free',
    priceLabel: 'Free',
    action: { kind: 'external', label: 'Open the live demo', href: 'https://fnmdemo.pragoptics.com' },
    features: [
      'Live view of any OmniBus you own',
      'SSH or cloud data exchange',
      'Runs on desktop, no install needed for the demo'
    ]
  },
  {
    id: 'pragoptics-ios',
    category: 'software',
    name: 'PragOptics for iOS',
    tagline: 'Mobile report capture and sync.',
    subtitle: 'Offline-first workflows, mobile-native capture, account-bound data access. Beta signups opening.',
    availability: 'coming-soon',
    access: 'free',
    priceLabel: 'Beta',
    action: { kind: 'notify', label: 'Notify me at beta' },
    features: [
      'Mobile report capture and sync',
      'Offline-first workflows',
      'Account-bound data access'
    ]
  },
  {
    id: 'pragoptics-spfx',
    category: 'software',
    name: 'SharePoint Extensions (SPFx)',
    tagline: 'Bring your SharePoint data to PragOptics.',
    subtitle: 'Import, export, and visualize SharePoint lists in PragOptics dashboards. Bring-Your-Own-Data (optional web-sync).',
    availability: 'coming-soon',
    access: 'free',
    priceLabel: 'BYOD',
    action: { kind: 'notify', label: 'Notify me at launch' },
    features: [
      'Import & export SharePoint data',
      'Manage & visualize with intuitive dashboards',
      'Bring-your-own-data (optional web-sync)'
    ]
  }
];

export const ALL_PRODUCTS = [...HARDWARE, ...SOFTWARE];

export function getProduct(id) {
  return ALL_PRODUCTS.find(p => p.id === id) || null;
}

export function formatPrice(cents) {
  if (cents == null) return null;
  const dollars = cents / 100;
  const hasCents = dollars % 1 !== 0;
  return '$' + dollars.toLocaleString('en-US', {
    minimumFractionDigits: hasCents ? 2 : 0,
    maximumFractionDigits: 2
  });
}

/** The preorder variant for a product, if it takes preorders. */
export function preorderVariant(product) {
  return (product?.variants || []).find(v => v.id === 'preorder') || null;
}

/** True when a product is orderable only as a preorder (deposit) today. */
export function isPreorder(product) {
  return !!preorderVariant(product) &&
    (product.availability === 'coming-soon' || product.availability === 'preorder');
}
