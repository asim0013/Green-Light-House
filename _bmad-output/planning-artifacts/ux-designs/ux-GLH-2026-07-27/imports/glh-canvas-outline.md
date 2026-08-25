# GLH Pencil canvas — recovered outline

> Generated from `glh-canvas-recovered.pen.json`, itself recovered on 2026-08-25 from
> `C:/Users/user/.pencil/backup/ea3399bd07d15d2f43d0046e93e473f138ecd474` (682,566 bytes, mtime 2026-07-31).
> The original `.pen` path in the UX decision log is dead; this plaintext backup is the only surviving copy.
> The document `fileToken` was stripped on recovery. This outline is generated — edit the JSON, not this file.

## Design tokens declared on the canvas

| Variable | Type | Value |
|---|---|---|
| `surface` | color | `#FFFFFF` |
| `surface-2` | color | `#F5F7FA` |
| `ink` | color | `#14181F` |
| `ink-2` | color | `#5A6470` |
| `muted` | color | `#8A93A0` |
| `accent` | color | `#0E2F57` |
| `accent-soft` | color | `#5C86B5` |
| `border-subtle` | color | `#E6E9EE` |
| `font-heading` | string | `Geist` |
| `font-body` | string | `Inter` |
| `font-mono` | string | `Geist Mono` |
| `font-data` | string | `IBM Plex Mono` |
| `brand` | color | `#159A5B` |

## Frames

### Home — Desktop  `#gYiHV`

```
frame "Home — Desktop" {width=1440 fill=$surface layout=vertical}
  frame "Top Nav" {width=fill_container fill=$surface stroke=$border-subtle strokeWidth={"bottom":1} padding=[20,100] justifyContent=space_between alignItems=center}
    frame "Brand" {gap=10 alignItems=center}
      frame "Mark" {width=26 height=26 fill=$brand justifyContent=center alignItems=center}
        text "MarkGlyph" {fill=#FFFFFF fontFamily=$font-heading fontSize=16 fontWeight=700}  ← "G"
      text "Wordmark" {fill=$ink fontFamily=$font-heading fontSize=16 fontWeight=700 letterSpacing=0.5}  ← "GREENLIGHTHOUSE"
    frame "Nav Links" {gap=28 alignItems=center}
      text "Industries" {fill=$ink-2 fontFamily=$font-body fontSize=14 fontWeight=normal}  ← "Industries"
      text "Products" {fill=$ink-2 fontFamily=$font-body fontSize=14 fontWeight=normal}  ← "Products"
      text "Projects" {fill=$ink-2 fontFamily=$font-body fontSize=14 fontWeight=normal}  ← "Projects"
      text "Services" {fill=$ink-2 fontFamily=$font-body fontSize=14 fontWeight=normal}  ← "Services"
      text "About" {fill=$ink-2 fontFamily=$font-body fontSize=14 fontWeight=normal}  ← "About"
    frame "Actions" {gap=16 alignItems=center}
      frame "Lang" {gap=6 alignItems=center}
        text "EN" {fill=$ink fontFamily=$font-mono fontSize=12 fontWeight=normal}  ← "EN"
        text "Sep1" {fill=$muted fontFamily=$font-mono fontSize=12 fontWeight=normal}  ← "/"
        text "TR" {fill=$muted fontFamily=$font-mono fontSize=12 fontWeight=normal}  ← "TR"
        text "Sep2" {fill=$muted fontFamily=$font-mono fontSize=12 fontWeight=normal}  ← "/"
        text "RU" {fill=$muted fontFamily=$font-mono fontSize=12 fontWeight=normal}  ← "RU"
      text "Phone" {fill=$ink fontFamily=$font-mono fontSize=13 fontWeight=normal}  ← "+90 212 000 00 00"
      frame "Nav CTA" {fill=$accent padding=[10,18] alignItems=center}
        text "CTA Label" {fill=#FFFFFF fontFamily=$font-body fontSize=14 fontWeight=600}  ← "Request Project Quote"
  frame "Hero" {width=fill_container fill=$surface gap=56 padding=[72,100]}
    frame "Hero Left" {width=640 layout=vertical gap=28}
      text "Eyebrow" {fill=$accent fontFamily=$font-mono fontSize=13 fontWeight=normal letterSpacing=1.5}  ← "ENGINEERING & PROJECT SUPPLY"
      frame "Headline" {layout=vertical gap=2}
        text "HL1" {fill=$ink fontFamily=$font-heading fontSize=50 fontWeight=700 lineHeight=1.05 letterSpacing=-1}  ← "Engineered supply for"
        text "HL2" {fill=$ink fontFamily=$font-heading fontSize=50 fontWeight=700 lineHeight=1.05 letterSpacing=-1}  ← "industrial & fire-safety"
        frame "HL3 Boxed" {fill=$accent padding=[2,10]}
          text "HL3 Text" {fill=#FFFFFF fontFamily=$font-heading fontSize=50 fontWeight=700 letterSpacing=-1}  ← "projects."
      text "Subhead" {width=fill_container fill=$ink-2 fontFamily=$font-body fontSize=17 fontWeight=normal lineHeight=1.5 textGrowth=fixed-width}  ← "We source, technically select, and deliver complete equipment packages across Turkey, Russ"
      frame "CTA Row" {gap=14 alignItems=center}
        frame "Primary CTA" {fill=$accent gap=8 padding=[13,22] alignItems=center}
          text "Label" {fill=#FFFFFF fontFamily=$font-body fontSize=15 fontWeight=600}  ← "Request Project Quote"
          icon "Arrow" {width=16 height=16 fill=#FFFFFF icon=arrow-right}
        frame "Secondary CTA" {fill=$surface stroke=$ink strokeWidth=1.5 gap=8 padding=[13,22] alignItems=center}
          icon "PhoneIcon" {width=16 height=16 fill=$ink icon=phone}
          text "Label" {fill=$ink fontFamily=$font-body fontSize=15 fontWeight=600}  ← "Call an engineer"
      frame "Trust Strip" {width=fill_container gap=18 alignItems=center}
        text "TrustLabel" {fill=$muted fontFamily=$font-mono fontSize=11 fontWeight=normal letterSpacing=1}  ← "CERTIFIED"
        text "ISO 9001" {fill=$ink fontFamily=$font-mono fontSize=12 fontWeight=normal}  ← "ISO 9001"
        text "CE" {fill=$ink fontFamily=$font-mono fontSize=12 fontWeight=normal}  ← "CE"
        text "EN" {fill=$ink fontFamily=$font-mono fontSize=12 fontWeight=normal}  ← "EN"
        text "A.TR" {fill=$ink fontFamily=$font-mono fontSize=12 fontWeight=normal}  ← "A.TR"
        frame "Div" {width=1 height=14 fill=$border-subtle}
        text "NuclearQA" {fill=$accent fontFamily=$font-mono fontSize=12 fontWeight=normal}  ← "Nuclear-grade QA"
    frame "Hero Right" {width=fill_container layout=vertical}
      frame "Project Card" {width=fill_container fill=$surface stroke=$ink strokeWidth=1.5 layout=vertical}
        frame "Card Header" {width=fill_container stroke=$border-subtle strokeWidth={"bottom":1} padding=[14,20] justifyContent=space_between alignItems=center}
          text "Kicker" {fill=$accent fontFamily=$font-mono fontSize=11 fontWeight=normal letterSpacing=1.5}  ← "DELIVERED PROJECT"
          text "Ref" {fill=$muted fontFamily=$font-mono fontSize=11 fontWeight=normal}  ← "GLH-2024-117"
        frame "Schematic" {width=fill_container fill=$surface-2 layout=vertical gap=10 padding=[18,20]}
          text "SchemLabel" {fill=$muted fontFamily=$font-mono fontSize=10 fontWeight=normal letterSpacing=1}  ← "SYSTEM SCHEMATIC — DELUGE ZONES"
          frame "Zones" {width=fill_container gap=14 alignItems=center}
            frame "ZONE 1" {width=fill_container height=84 fill=$surface stroke=$ink strokeWidth=1 layout=vertical padding=12 justifyContent=space_between}
              text "ZTag" {fill=$ink fontFamily=$font-mono fontSize=11 fontWeight=normal}  ← "ZONE 1"
              frame "Dots" {gap=5 alignItems=center}
                ellipse "d0" {width=6 height=6 fill=$accent-soft}
                ellipse "d1" {width=6 height=6 fill=$accent-soft}
                ellipse "d2" {width=6 height=6 fill=$accent-soft}
            frame "ZONE 2" {width=fill_container height=84 fill=$surface stroke=$ink strokeWidth=1 layout=vertical padding=12 justifyContent=space_between}
              text "ZTag" {fill=$ink fontFamily=$font-mono fontSize=11 fontWeight=normal}  ← "ZONE 2"
              frame "Dots" {gap=5 alignItems=center}
                ellipse "d0" {width=6 height=6 fill=$accent-soft}
                ellipse "d1" {width=6 height=6 fill=$accent-soft}
                ellipse "d2" {width=6 height=6 fill=$accent-soft}
            frame "ZONE 3" {width=fill_container height=84 fill=$surface stroke=$ink strokeWidth=1 layout=vertical padding=12 justifyContent=space_between}
              text "ZTag" {fill=$ink fontFamily=$font-mono fontSize=11 fontWeight=normal}  ← "ZONE 3"
              frame "Dots" {gap=5 alignItems=center}
                ellipse "d0" {width=6 height=6 fill=$accent-soft}
                ellipse "d1" {width=6 height=6 fill=$accent-soft}
                ellipse "d2" {width=6 height=6 fill=$accent-soft}
        frame "Card Body" {width=fill_container layout=vertical gap=14 padding=20}
          text "CardTitle" {fill=$ink fontFamily=$font-heading fontSize=22 fontWeight=600}  ← "Fire-suppression system"
          text "CardSub" {width=fill_container fill=$ink-2 fontFamily=$font-body fontSize=14 fontWeight=normal lineHeight=1.45 textGrowth=fixed-width}  ← "40,000 m² logistics hub — multi-zone deluge, delivered end to end."
          frame "Meta" {width=fill_container layout=vertical gap=9}
            frame "INDUSTRY" {width=fill_container justifyContent=space_between alignItems=center}
              text "k" {fill=$muted fontFamily=$font-mono fontSize=11 fontWeight=normal letterSpacing=1}  ← "INDUSTRY"
              text "v" {fill=$ink fontFamily=$font-body fontSize=13 fontWeight=normal}  ← "Logistics"
            frame "SCOPE" {width=fill_container justifyContent=space_between alignItems=center}
              text "k" {fill=$muted fontFamily=$font-mono fontSize=11 fontWeight=normal letterSpacing=1}  ← "SCOPE"
              text "v" {fill=$ink fontFamily=$font-body fontSize=13 fontWeight=normal}  ← "Design + supply + logistics"
            frame "DELIVERED" {width=fill_container justifyContent=space_between alignItems=center}
              text "k" {fill=$muted fontFamily=$font-mono fontSize=11 fontWeight=normal letterSpacing=1}  ← "DELIVERED"
              text "v" {fill=$ink fontFamily=$font-body fontSize=13 fontWeight=normal}  ← "6 weeks · 3 borders"
        frame "Card Footer" {width=fill_container stroke=$border-subtle strokeWidth={"top":1} padding=[14,20] justifyContent=space_between alignItems=center}
          text "FootLink" {fill=$accent fontFamily=$font-body fontSize=14 fontWeight=600}  ← "I have a similar project"
          icon "FootArrow" {width=16 height=16 fill=$accent icon=arrow-right}
  frame "Stats Band" {width=fill_container fill=$ink padding=[36,100] justifyContent=space_between alignItems=center}
    frame "Stat" {layout=vertical gap=6}
      text "Val" {fill=#FFFFFF fontFamily=$font-data fontSize=32 fontWeight=700}  ← "5"
      text "Lab" {fill=#9AA6B4 fontFamily=$font-body fontSize=13 fontWeight=normal}  ← "Core industries served"
    frame "Stat" {layout=vertical gap=6}
      text "Val" {fill=#FFFFFF fontFamily=$font-data fontSize=32 fontWeight=700}  ← "3"
      text "Lab" {fill=#9AA6B4 fontFamily=$font-body fontSize=13 fontWeight=normal}  ← "Cross-border corridors · TR·RU·Intl"
    frame "Stat" {layout=vertical gap=6}
      text "Val" {fill=#FFFFFF fontFamily=$font-data fontSize=32 fontWeight=700}  ← "24h"
      text "Lab" {fill=#9AA6B4 fontFamily=$font-body fontSize=13 fontWeight=normal}  ← "RFQ technical review"
    frame "Stat" {layout=vertical gap=6}
      text "Val" {fill=#FFFFFF fontFamily=$font-data fontSize=32 fontWeight=700}  ← "A.TR / CE / EN"
      text "Lab" {fill=#9AA6B4 fontFamily=$font-body fontSize=13 fontWeight=normal}  ← "Compliance-ready docs"
  frame "Industries" {width=fill_container fill=$surface layout=vertical gap=36 padding=[72,100]}
    frame "Ind Head" {width=fill_container layout=vertical gap=12}
      frame "Ind Title Row" {gap=12 alignItems=center}
        text "IT1" {fill=$ink fontFamily=$font-heading fontSize=34 fontWeight=700 letterSpacing=-0.5}  ← "Enter by your"
        frame "IT Boxed" {fill=$accent padding=[2,10]}
          text "ITB" {fill=#FFFFFF fontFamily=$font-heading fontSize=34 fontWeight=700 letterSpacing=-0.5}  ← "industry"
      text "Ind Sub" {width=720 fill=$ink-2 fontFamily=$font-body fontSize=16 fontWeight=normal lineHeight=1.5 textGrowth=fixed-width}  ← "Engineers think in projects, not catalogs. Each industry opens a world curated for it — th"
    frame "Ind Row 1" {width=fill_container gap=20}
      frame "Oil & Gas" {width=fill_container fill=$surface stroke=$border-subtle strokeWidth=1 layout=vertical gap=14 padding=24}
        frame "IconBox" {width=44 height=44 fill=$surface-2 stroke=$ink strokeWidth=1 justifyContent=center alignItems=center}
          icon "Icon" {width=22 height=22 fill=$ink icon=fuel}
        text "Title" {fill=$ink fontFamily=$font-heading fontSize=19 fontWeight=600}  ← "Oil & Gas"
        text "Desc" {width=fill_container fill=$ink-2 fontFamily=$font-body fontSize=14 fontWeight=normal lineHeight=1.45 textGrowth=fixed-width}  ← "Explosion-proof & process equipment"
        frame "Link" {gap=6 alignItems=center}
          text "LinkText" {fill=$accent fontFamily=$font-body fontSize=13 fontWeight=600}  ← "Explore"
          icon "LinkArrow" {width=14 height=14 fill=$accent icon=arrow-right}
      frame "Energy" {width=fill_container fill=$surface stroke=$border-subtle strokeWidth=1 layout=vertical gap=14 padding=24}
        frame "IconBox" {width=44 height=44 fill=$surface-2 stroke=$ink strokeWidth=1 justifyContent=center alignItems=center}
          icon "Icon" {width=22 height=22 fill=$ink icon=zap}
        text "Title" {fill=$ink fontFamily=$font-heading fontSize=19 fontWeight=600}  ← "Energy"
        text "Desc" {width=fill_container fill=$ink-2 fontFamily=$font-body fontSize=14 fontWeight=normal lineHeight=1.45 textGrowth=fixed-width}  ← "Power, grid & renewables supply"
        frame "Link" {gap=6 alignItems=center}
          text "LinkText" {fill=$accent fontFamily=$font-body fontSize=13 fontWeight=600}  ← "Explore"
          icon "LinkArrow" {width=14 height=14 fill=$accent icon=arrow-right}
      frame "Nuclear" {width=fill_container fill=$surface stroke=$border-subtle strokeWidth=1 layout=vertical gap=14 padding=24}
        frame "IconBox" {width=44 height=44 fill=$surface-2 stroke=$ink strokeWidth=1 justifyContent=center alignItems=center}
          icon "Icon" {width=22 height=22 fill=$ink icon=atom}
        text "Title" {fill=$ink fontFamily=$font-heading fontSize=19 fontWeight=600}  ← "Nuclear"
        text "Desc" {width=fill_container fill=$ink-2 fontFamily=$font-body fontSize=14 fontWeight=normal lineHeight=1.45 textGrowth=fixed-width}  ← "Nuclear-grade QA & traceability"
        frame "Link" {gap=6 alignItems=center}
          text "LinkText" {fill=$accent fontFamily=$font-body fontSize=13 fontWeight=600}  ← "Explore"
          icon "LinkArrow" {width=14 height=14 fill=$accent icon=arrow-right}
    frame "Ind Row 2" {width=fill_container gap=20}
      frame "Construction" {width=fill_container fill=$surface stroke=$border-subtle strokeWidth=1 layout=vertical gap=14 padding=24}
        frame "IconBox" {width=44 height=44 fill=$surface-2 stroke=$ink strokeWidth=1 justifyContent=center alignItems=center}
          icon "Icon" {width=22 height=22 fill=$ink icon=building-2}
        text "Title" {fill=$ink fontFamily=$font-heading fontSize=19 fontWeight=600}  ← "Construction"
        text "Desc" {width=fill_container fill=$ink-2 fontFamily=$font-body fontSize=14 fontWeight=normal lineHeight=1.45 textGrowth=fixed-width}  ← "Fire, safety & site equipment"
        frame "Link" {gap=6 alignItems=center}
          text "LinkText" {fill=$accent fontFamily=$font-body fontSize=13 fontWeight=600}  ← "Explore"
          icon "LinkArrow" {width=14 height=14 fill=$accent icon=arrow-right}
      frame "Manufacturing" {width=fill_container fill=$surface stroke=$border-subtle strokeWidth=1 layout=vertical gap=14 padding=24}
        frame "IconBox" {width=44 height=44 fill=$surface-2 stroke=$ink strokeWidth=1 justifyContent=center alignItems=center}
          icon "Icon" {width=22 height=22 fill=$ink icon=factory}
        text "Title" {fill=$ink fontFamily=$font-heading fontSize=19 fontWeight=600}  ← "Manufacturing"
        text "Desc" {width=fill_container fill=$ink-2 fontFamily=$font-body fontSize=14 fontWeight=normal lineHeight=1.45 textGrowth=fixed-width}  ← "Process, handling & protective gear"
        frame "Link" {gap=6 alignItems=center}
          text "LinkText" {fill=$accent fontFamily=$font-body fontSize=13 fontWeight=600}  ← "Explore"
          icon "LinkArrow" {width=14 height=14 fill=$accent icon=arrow-right}
      frame "Fire-safety" {width=fill_container fill=$surface stroke=$border-subtle strokeWidth=1 layout=vertical gap=14 padding=24}
        frame "IconBox" {width=44 height=44 fill=$surface-2 stroke=$ink strokeWidth=1 justifyContent=center alignItems=center}
          icon "Icon" {width=22 height=22 fill=$ink icon=siren}
        text "Title" {fill=$ink fontFamily=$font-heading fontSize=19 fontWeight=600}  ← "Fire-safety"
        text "Desc" {width=fill_container fill=$ink-2 fontFamily=$font-body fontSize=14 fontWeight=normal lineHeight=1.45 textGrowth=fixed-width}  ← "Detection, suppression & rescue"
        frame "Link" {gap=6 alignItems=center}
          text "LinkText" {fill=$accent fontFamily=$font-body fontSize=13 fontWeight=600}  ← "Explore"
          icon "LinkArrow" {width=14 height=14 fill=$accent icon=arrow-right}
  frame "Closing CTA" {width=fill_container fill=$ink layout=vertical gap=26 padding=[72,100] alignItems=center}
    text "CloseEyebrow" {fill=$accent-soft fontFamily=$font-mono fontSize=12 fontWeight=normal letterSpacing=1.5}  ← "PROCESS TRANSPARENCY — NO BLACK BOX"
    frame "Close HL" {layout=vertical gap=6 alignItems=center}
      text "CHL1" {fill=#FFFFFF fontFamily=$font-heading fontSize=38 fontWeight=700 letterSpacing=-0.5}  ← "Have a project? Get a specced"
      frame "CHL2 Row" {gap=10 alignItems=center}
        text "CHL2a" {fill=#FFFFFF fontFamily=$font-heading fontSize=38 fontWeight=700 letterSpacing=-0.5}  ← "proposal in"
        frame "CHL Boxed" {fill=$accent padding=[2,10]}
          text "CHLB" {fill=#FFFFFF fontFamily=$font-heading fontSize=38 fontWeight=700 letterSpacing=-0.5}  ← "3 working days."
    frame "Process Steps" {gap=14 alignItems=center}
      frame "Step 01" {stroke=#33404F strokeWidth=1 gap=10 padding=[10,16] alignItems=center}
        text "Num" {fill=$accent-soft fontFamily=$font-data fontSize=13 fontWeight=normal}  ← "01"
        text "Txt" {fill=#D6DCE4 fontFamily=$font-body fontSize=14 fontWeight=normal}  ← "RFQ review — 24h"
      icon "Sep0" {width=18 height=18 fill=$muted icon=chevron-right}
      frame "Step 02" {stroke=#33404F strokeWidth=1 gap=10 padding=[10,16] alignItems=center}
        text "Num" {fill=$accent-soft fontFamily=$font-data fontSize=13 fontWeight=normal}  ← "02"
        text "Txt" {fill=#D6DCE4 fontFamily=$font-body fontSize=14 fontWeight=normal}  ← "Spec + proposal — 3 days"
      icon "Sep1" {width=18 height=18 fill=$muted icon=chevron-right}
      frame "Step 03" {stroke=#33404F strokeWidth=1 gap=10 padding=[10,16] alignItems=center}
        text "Num" {fill=$accent-soft fontFamily=$font-data fontSize=13 fontWeight=normal}  ← "03"
        text "Txt" {fill=#D6DCE4 fontFamily=$font-body fontSize=14 fontWeight=normal}  ← "Formal quote"
    frame "Close CTA Row" {gap=14 alignItems=center}
      frame "Close Primary" {fill=$accent gap=8 padding=[14,24] alignItems=center}
        text "L" {fill=#FFFFFF fontFamily=$font-body fontSize=15 fontWeight=600}  ← "Request Project Quote"
        icon "A" {width=16 height=16 fill=#FFFFFF icon=arrow-right}
      frame "Close Secondary" {stroke=#33404F strokeWidth=1.5 gap=8 padding=[14,24] alignItems=center}
        icon "Ph" {width=16 height=16 fill=#FFFFFF icon=phone}
        text "L2" {fill=#FFFFFF fontFamily=$font-body fontSize=15 fontWeight=600}  ← "Call an engineer"
  frame "Footer" {width=fill_container fill=$surface stroke=$border-subtle strokeWidth={"top":1} padding=[28,100] justifyContent=space_between alignItems=center}
    text "FootBrand" {fill=$ink fontFamily=$font-heading fontSize=14 fontWeight=700 letterSpacing=0.5}  ← "GREENLIGHTHOUSE"
    frame "Foot Links" {gap=22 alignItems=center}
      text "Industries" {fill=$ink-2 fontFamily=$font-body fontSize=13 fontWeight=normal}  ← "Industries"
      text "Products" {fill=$ink-2 fontFamily=$font-body fontSize=13 fontWeight=normal}  ← "Products"
      text "Projects" {fill=$ink-2 fontFamily=$font-body fontSize=13 fontWeight=normal}  ← "Projects"
      text "Certificates" {fill=$ink-2 fontFamily=$font-body fontSize=13 fontWeight=normal}  ← "Certificates"
      text "Downloads" {fill=$ink-2 fontFamily=$font-body fontSize=13 fontWeight=normal}  ← "Downloads"
      text "Contact" {fill=$ink-2 fontFamily=$font-body fontSize=13 fontWeight=normal}  ← "Contact"
      text "Privacy" {fill=$ink-2 fontFamily=$font-body fontSize=13 fontWeight=normal}  ← "Privacy"
    text "FootLegal" {fill=$muted fontFamily=$font-mono fontSize=12 fontWeight=normal}  ← "İstanbul · EN / TR / RU"
```

### Products — Desktop  `#mdkE4`

```
frame "Products — Desktop" {width=1440 fill=$surface layout=vertical}
  frame "Top Nav" {width=fill_container fill=$surface stroke=$border-subtle strokeWidth={"bottom":1} padding=[20,100] justifyContent=space_between alignItems=center}
    frame "Brand" {gap=10 alignItems=center}
      frame "Mark" {width=26 height=26 fill=$brand justifyContent=center alignItems=center}
        text "MarkGlyph" {fill=#FFFFFF fontFamily=$font-heading fontSize=16 fontWeight=700}  ← "G"
      text "Wordmark" {fill=$ink fontFamily=$font-heading fontSize=16 fontWeight=700 letterSpacing=0.5}  ← "GREENLIGHTHOUSE"
    frame "Nav Links" {gap=28 alignItems=center}
      text "Industries" {fill=$ink-2 fontFamily=$font-body fontSize=14 fontWeight=normal}  ← "Industries"
      text "Products" {fill=$ink-2 fontFamily=$font-body fontSize=14 fontWeight=normal}  ← "Products"
      text "Projects" {fill=$ink-2 fontFamily=$font-body fontSize=14 fontWeight=normal}  ← "Projects"
      text "Services" {fill=$ink-2 fontFamily=$font-body fontSize=14 fontWeight=normal}  ← "Services"
      text "About" {fill=$ink-2 fontFamily=$font-body fontSize=14 fontWeight=normal}  ← "About"
    frame "Actions" {gap=16 alignItems=center}
      frame "Lang" {gap=6 alignItems=center}
        text "EN" {fill=$ink fontFamily=$font-mono fontSize=12 fontWeight=normal}  ← "EN"
        text "Sep1" {fill=$muted fontFamily=$font-mono fontSize=12 fontWeight=normal}  ← "/"
        text "TR" {fill=$muted fontFamily=$font-mono fontSize=12 fontWeight=normal}  ← "TR"
        text "Sep2" {fill=$muted fontFamily=$font-mono fontSize=12 fontWeight=normal}  ← "/"
        text "RU" {fill=$muted fontFamily=$font-mono fontSize=12 fontWeight=normal}  ← "RU"
      text "Phone" {fill=$ink fontFamily=$font-mono fontSize=13 fontWeight=normal}  ← "+90 212 000 00 00"
      frame "Nav CTA" {fill=$accent padding=[10,18] alignItems=center}
        text "CTA Label" {fill=#FFFFFF fontFamily=$font-body fontSize=14 fontWeight=600}  ← "Request Project Quote"
  frame "Catalog Header" {width=fill_container fill=$surface-2 stroke=$border-subtle strokeWidth={"bottom":1} layout=vertical gap=22 padding=[44,100]}
    frame "Crumb" {gap=8 alignItems=center}
      text "c1" {fill=$muted fontFamily=$font-mono fontSize=12 fontWeight=normal}  ← "Home"
      text "cs" {fill=$muted fontFamily=$font-mono fontSize=12 fontWeight=normal}  ← "/"
      text "c2" {fill=$ink fontFamily=$font-mono fontSize=12 fontWeight=normal}  ← "Products"
    text "H1" {fill=$ink fontFamily=$font-heading fontSize=38 fontWeight=700 letterSpacing=-0.5}  ← "Product catalog"
    text "Sub" {width=760 fill=$ink-2 fontFamily=$font-body fontSize=16 fontWeight=normal lineHeight=1.5 textGrowth=fixed-width}  ← "Search by manufacturer, model, category or series. No prices — full technical specs and da"
    frame "Search Bar" {width=fill_container fill=$surface stroke=$ink strokeWidth=1.5 alignItems=center}
      frame "SIconBox" {padding=[14,16] alignItems=center}
        icon "SIcon" {width=20 height=20 fill=$ink-2 icon=search}
      text "SPlaceholder" {width=fill_container fill=$muted fontFamily=$font-mono fontSize=15 fontWeight=normal textGrowth=fixed-width}  ← "Paste a model number  —  e.g.  Bosch FPA-5000"
      frame "Search Btn" {fill=$accent gap=8 padding=[14,26] alignItems=center}
        text "SBtnL" {fill=#FFFFFF fontFamily=$font-body fontSize=15 fontWeight=600}  ← "Search"
    frame "Quick Filters" {width=fill_container gap=10 alignItems=center}
      text "QLabel" {fill=$muted fontFamily=$font-mono fontSize=11 fontWeight=normal letterSpacing=1}  ← "BROWSE:"
      frame "Oil & Gas" {fill=$surface stroke=$border-subtle strokeWidth=1 padding=[7,14]}
        text "t" {fill=$ink fontFamily=$font-body fontSize=13 fontWeight=normal}  ← "Oil & Gas"
      frame "Energy" {fill=$surface stroke=$border-subtle strokeWidth=1 padding=[7,14]}
        text "t" {fill=$ink fontFamily=$font-body fontSize=13 fontWeight=normal}  ← "Energy"
      frame "Nuclear" {fill=$surface stroke=$border-subtle strokeWidth=1 padding=[7,14]}
        text "t" {fill=$ink fontFamily=$font-body fontSize=13 fontWeight=normal}  ← "Nuclear"
      frame "Construction" {fill=$surface stroke=$border-subtle strokeWidth=1 padding=[7,14]}
        text "t" {fill=$ink fontFamily=$font-body fontSize=13 fontWeight=normal}  ← "Construction"
      frame "Manufacturing" {fill=$surface stroke=$border-subtle strokeWidth=1 padding=[7,14]}
        text "t" {fill=$ink fontFamily=$font-body fontSize=13 fontWeight=normal}  ← "Manufacturing"
      frame "Fire-safety" {fill=$surface stroke=$border-subtle strokeWidth=1 padding=[7,14]}
        text "t" {fill=$ink fontFamily=$font-body fontSize=13 fontWeight=normal}  ← "Fire-safety"
  frame "Catalog Body" {width=fill_container fill=$surface gap=40 padding=[40,100]}
    frame "Filters" {width=250 layout=vertical gap=26}
      frame "CATEGORY" {width=fill_container layout=vertical gap=12}
        text "GH" {fill=$muted fontFamily=$font-mono fontSize=11 fontWeight=normal letterSpacing=1.5}  ← "CATEGORY"
        frame "Fire detection" {width=fill_container gap=10 alignItems=center}
          frame "Box" {width=15 height=15 fill=$surface stroke=$ink strokeWidth=1}
          text "L" {width=fill_container fill=$ink fontFamily=$font-body fontSize=14 fontWeight=normal textGrowth=fixed-width}  ← "Fire detection"
          text "C" {fill=$muted fontFamily=$font-mono fontSize=12 fontWeight=normal}  ← "42"
        frame "Suppression" {width=fill_container gap=10 alignItems=center}
          frame "Box" {width=15 height=15 fill=$surface stroke=$ink strokeWidth=1}
          text "L" {width=fill_container fill=$ink fontFamily=$font-body fontSize=14 fontWeight=normal textGrowth=fixed-width}  ← "Suppression"
          text "C" {fill=$muted fontFamily=$font-mono fontSize=12 fontWeight=normal}  ← "31"
        frame "Gas detection" {width=fill_container gap=10 alignItems=center}
          frame "Box" {width=15 height=15 fill=$surface stroke=$ink strokeWidth=1}
          text "L" {width=fill_container fill=$ink fontFamily=$font-body fontSize=14 fontWeight=normal textGrowth=fixed-width}  ← "Gas detection"
          text "C" {fill=$muted fontFamily=$font-mono fontSize=12 fontWeight=normal}  ← "18"
        frame "Protective equipment" {width=fill_container gap=10 alignItems=center}
          frame "Box" {width=15 height=15 fill=$surface stroke=$ink strokeWidth=1}
          text "L" {width=fill_container fill=$ink fontFamily=$font-body fontSize=14 fontWeight=normal textGrowth=fixed-width}  ← "Protective equipment"
          text "C" {fill=$muted fontFamily=$font-mono fontSize=12 fontWeight=normal}  ← "24"
        frame "Process & control" {width=fill_container gap=10 alignItems=center}
          frame "Box" {width=15 height=15 fill=$surface stroke=$ink strokeWidth=1}
          text "L" {width=fill_container fill=$ink fontFamily=$font-body fontSize=14 fontWeight=normal textGrowth=fixed-width}  ← "Process & control"
          text "C" {fill=$muted fontFamily=$font-mono fontSize=12 fontWeight=normal}  ← "13"
      frame "MANUFACTURER" {width=fill_container layout=vertical gap=12}
        text "GH" {fill=$muted fontFamily=$font-mono fontSize=11 fontWeight=normal letterSpacing=1.5}  ← "MANUFACTURER"
        frame "Bosch" {width=fill_container gap=10 alignItems=center}
          frame "Box" {width=15 height=15 fill=$surface stroke=$ink strokeWidth=1}
          text "L" {width=fill_container fill=$ink fontFamily=$font-body fontSize=14 fontWeight=normal textGrowth=fixed-width}  ← "Bosch"
          text "C" {fill=$muted fontFamily=$font-mono fontSize=12 fontWeight=normal}  ← "19"
        frame "Honeywell" {width=fill_container gap=10 alignItems=center}
          frame "Box" {width=15 height=15 fill=$surface stroke=$ink strokeWidth=1}
          text "L" {width=fill_container fill=$ink fontFamily=$font-body fontSize=14 fontWeight=normal textGrowth=fixed-width}  ← "Honeywell"
          text "C" {fill=$muted fontFamily=$font-mono fontSize=12 fontWeight=normal}  ← "22"
        frame "Siemens" {width=fill_container gap=10 alignItems=center}
          frame "Box" {width=15 height=15 fill=$surface stroke=$ink strokeWidth=1}
          text "L" {width=fill_container fill=$ink fontFamily=$font-body fontSize=14 fontWeight=normal textGrowth=fixed-width}  ← "Siemens"
          text "C" {fill=$muted fontFamily=$font-mono fontSize=12 fontWeight=normal}  ← "15"
        frame "Dräger" {width=fill_container gap=10 alignItems=center}
          frame "Box" {width=15 height=15 fill=$surface stroke=$ink strokeWidth=1}
          text "L" {width=fill_container fill=$ink fontFamily=$font-body fontSize=14 fontWeight=normal textGrowth=fixed-width}  ← "Dräger"
          text "C" {fill=$muted fontFamily=$font-mono fontSize=12 fontWeight=normal}  ← "11"
        frame "MSA" {width=fill_container gap=10 alignItems=center}
          frame "Box" {width=15 height=15 fill=$surface stroke=$ink strokeWidth=1}
          text "L" {width=fill_container fill=$ink fontFamily=$font-body fontSize=14 fontWeight=normal textGrowth=fixed-width}  ← "MSA"
          text "C" {fill=$muted fontFamily=$font-mono fontSize=12 fontWeight=normal}  ← "9"
      frame "CERTIFICATION" {width=fill_container layout=vertical gap=12}
        text "GH" {fill=$muted fontFamily=$font-mono fontSize=11 fontWeight=normal letterSpacing=1.5}  ← "CERTIFICATION"
        frame "EN 54" {width=fill_container gap=10 alignItems=center}
          frame "Box" {width=15 height=15 fill=$surface stroke=$ink strokeWidth=1}
          text "L" {width=fill_container fill=$ink fontFamily=$font-body fontSize=14 fontWeight=normal textGrowth=fixed-width}  ← "EN 54"
          text "C" {fill=$muted fontFamily=$font-mono fontSize=12 fontWeight=normal}  ← "28"
        frame "ATEX" {width=fill_container gap=10 alignItems=center}
          frame "Box" {width=15 height=15 fill=$surface stroke=$ink strokeWidth=1}
          text "L" {width=fill_container fill=$ink fontFamily=$font-body fontSize=14 fontWeight=normal textGrowth=fixed-width}  ← "ATEX"
          text "C" {fill=$muted fontFamily=$font-mono fontSize=12 fontWeight=normal}  ← "33"
        frame "FM / UL" {width=fill_container gap=10 alignItems=center}
          frame "Box" {width=15 height=15 fill=$surface stroke=$ink strokeWidth=1}
          text "L" {width=fill_container fill=$ink fontFamily=$font-body fontSize=14 fontWeight=normal textGrowth=fixed-width}  ← "FM / UL"
          text "C" {fill=$muted fontFamily=$font-mono fontSize=12 fontWeight=normal}  ← "20"
        frame "CE" {width=fill_container gap=10 alignItems=center}
          frame "Box" {width=15 height=15 fill=$surface stroke=$ink strokeWidth=1}
          text "L" {width=fill_container fill=$ink fontFamily=$font-body fontSize=14 fontWeight=normal textGrowth=fixed-width}  ← "CE"
          text "C" {fill=$muted fontFamily=$font-mono fontSize=12 fontWeight=normal}  ← "61"
        frame "A.TR" {width=fill_container gap=10 alignItems=center}
          frame "Box" {width=15 height=15 fill=$surface stroke=$ink strokeWidth=1}
          text "L" {width=fill_container fill=$ink fontFamily=$font-body fontSize=14 fontWeight=normal textGrowth=fixed-width}  ← "A.TR"
          text "C" {fill=$muted fontFamily=$font-mono fontSize=12 fontWeight=normal}  ← "44"
    frame "Results" {width=fill_container layout=vertical gap=20}
      frame "Toolbar" {width=fill_container stroke=$border-subtle strokeWidth={"bottom":1} padding=[0,0,14,0] justifyContent=space_between alignItems=center}
        text "Count" {fill=$ink fontFamily=$font-mono fontSize=13 fontWeight=normal}  ← "128 products  ·  no prices, full specs"
        frame "Sort" {stroke=$border-subtle strokeWidth=1 gap=8 padding=[8,14] alignItems=center}
          text "SortL" {fill=$ink fontFamily=$font-body fontSize=13 fontWeight=normal}  ← "Sort: Relevance"
          icon "SortI" {width=15 height=15 fill=$ink-2 icon=chevron-down}
      frame "Grid Row 1" {width=fill_container gap=20}
        ref "Fire panel FPA-5000" {width=fill_container}
        ref "Gas detector XNX Universal" {width=fill_container}
        ref "Deluge valve E-1" {width=fill_container}
      frame "Grid Row 2" {width=fill_container gap=20}
        ref "Sprinkler TY-FRB" {width=fill_container}
        ref "PLC SIMATIC S7-1500" {width=fill_container}
        ref "SCBA G1 breathing apparatus" {width=fill_container}
      frame "Grid Row 3" {width=fill_container gap=20}
        ref "Gas monitor X-am 5000" {width=fill_container}
        ref "Motor M3BP process" {width=fill_container}
        ref "Valve terminal VUVG" {width=fill_container}
```

### component/Product Card  `#gf9DY`

```
frame "component/Product Card" {width=300 fill=$surface stroke=$border-subtle strokeWidth=1 layout=vertical}
  frame "Thumb" {width=fill_container height=140 fill=$surface-2 stroke=$border-subtle strokeWidth={"bottom":1} justifyContent=center alignItems=center}
    icon "ThumbIcon" {width=40 height=40 fill=$ink-2 icon=cpu}
  frame "Body" {width=fill_container layout=vertical gap=10 padding=16}
    text "Manufacturer" {fill=$muted fontFamily=$font-mono fontSize=11 fontWeight=normal letterSpacing=1}  ← "MANUFACTURER"
    text "Title" {width=fill_container fill=$ink fontFamily=$font-heading fontSize=16 fontWeight=600 lineHeight=1.2 textGrowth=fixed-width}  ← "Product title"
    frame "Specs" {width=fill_container layout=vertical gap=6}
      frame "Spec1" {width=fill_container justifyContent=space_between}
        text "S1K" {fill=$muted fontFamily=$font-mono fontSize=11 fontWeight=normal}  ← "Spec"
        text "S1V" {fill=$ink fontFamily=$font-body fontSize=12 fontWeight=normal}  ← "value"
      frame "Spec2" {width=fill_container justifyContent=space_between}
        text "S2K" {fill=$muted fontFamily=$font-mono fontSize=11 fontWeight=normal}  ← "Spec"
        text "S2V" {fill=$ink fontFamily=$font-body fontSize=12 fontWeight=normal}  ← "value"
  frame "Card Foot" {width=fill_container stroke=$border-subtle strokeWidth={"top":1} padding=[12,16] justifyContent=space_between alignItems=center}
    frame "DL" {gap=6 alignItems=center}
      icon "DLIcon" {width=15 height=15 fill=$accent icon=download}
      text "DLText" {fill=$accent fontFamily=$font-body fontSize=13 fontWeight=600}  ← "Datasheet"
    frame "AddBtn" {stroke=$ink strokeWidth=1 padding=[7,12] alignItems=center}
      text "AddL" {fill=$ink fontFamily=$font-body fontSize=13 fontWeight=normal}  ← "Add to inquiry"
```

### Admin — Inquiries  `#H5Z2W`

```
frame "Admin — Inquiries" {width=1440 height=1024 fill=$surface}
  frame "Admin Sidebar" {width=244 height=fill_container fill=$ink layout=vertical padding=[24,0] justifyContent=space_between}
    frame "SB Top" {width=fill_container layout=vertical gap=6}
      frame "SB Brand" {gap=10 padding=[0,20,20,20] alignItems=center}
        frame "Mark" {width=24 height=24 fill=$brand justifyContent=center alignItems=center}
          text "G" {fill=#FFFFFF fontFamily=$font-heading fontSize=14 fontWeight=700}  ← "G"
        frame "BT" {layout=vertical}
          text "Nm" {fill=#FFFFFF fontFamily=$font-heading fontSize=12 fontWeight=700 letterSpacing=0.5}  ← "GREENLIGHTHOUSE"
          text "Ad" {fill=#7C8896 fontFamily=$font-mono fontSize=10 fontWeight=normal letterSpacing=1}  ← "Admin"
      frame "Dashboard" {width=fill_container fill=#00000000 stroke=#00000000 gap=12 padding=[12,20] justifyContent=space_between alignItems=center}
        frame "lft" {gap=12 alignItems=center}
          icon "i" {width=18 height=18 fill=#9AA6B4 icon=layout-dashboard}
          text "l" {fill=#C2CAD4 fontFamily=$font-body fontSize=14}  ← "Dashboard"
      frame "Inquiries" {width=fill_container fill=#1E2A3A stroke=$accent-soft strokeWidth={"left":3} gap=12 padding=[12,20] justifyContent=space_between alignItems=center}
        frame "lft" {gap=12 alignItems=center}
          icon "i" {width=18 height=18 fill=#FFFFFF icon=inbox}
          text "l" {fill=#FFFFFF fontFamily=$font-body fontSize=14 fontWeight=600}  ← "Inquiries"
        frame "bd" {fill=$brand padding=[2,8]}
          text "n" {fill=#FFFFFF fontFamily=$font-data fontSize=11 fontWeight=normal}  ← "4"
      frame "Catalog" {width=fill_container fill=#00000000 stroke=#00000000 gap=12 padding=[12,20] justifyContent=space_between alignItems=center}
        frame "lft" {gap=12 alignItems=center}
          icon "i" {width=18 height=18 fill=#9AA6B4 icon=package}
          text "l" {fill=#C2CAD4 fontFamily=$font-body fontSize=14}  ← "Catalog"
      frame "Projects" {width=fill_container fill=#00000000 stroke=#00000000 gap=12 padding=[12,20] justifyContent=space_between alignItems=center}
        frame "lft" {gap=12 alignItems=center}
          icon "i" {width=18 height=18 fill=#9AA6B4 icon=folder}
          text "l" {fill=#C2CAD4 fontFamily=$font-body fontSize=14}  ← "Projects"
      frame "Manufacturers" {width=fill_container fill=#00000000 stroke=#00000000 gap=12 padding=[12,20] justifyContent=space_between alignItems=center}
        frame "lft" {gap=12 alignItems=center}
          icon "i" {width=18 height=18 fill=#9AA6B4 icon=building-2}
          text "l" {fill=#C2CAD4 fontFamily=$font-body fontSize=14}  ← "Manufacturers"
      frame "Media" {width=fill_container fill=#00000000 stroke=#00000000 gap=12 padding=[12,20] justifyContent=space_between alignItems=center}
        frame "lft" {gap=12 alignItems=center}
          icon "i" {width=18 height=18 fill=#9AA6B4 icon=image}
          text "l" {fill=#C2CAD4 fontFamily=$font-body fontSize=14}  ← "Media"
      frame "Settings" {width=fill_container fill=#00000000 stroke=#00000000 gap=12 padding=[12,20] justifyContent=space_between alignItems=center}
        frame "lft" {gap=12 alignItems=center}
          icon "i" {width=18 height=18 fill=#9AA6B4 icon=settings}
          text "l" {fill=#C2CAD4 fontFamily=$font-body fontSize=14}  ← "Settings"
    frame "SB User" {width=fill_container stroke=#26313F strokeWidth={"top":1} gap=10 padding=[16,20] alignItems=center}
      frame "Avatar" {width=32 height=32 fill=#2A3646 justifyContent=center alignItems=center}
        text "in" {fill=#C2CAD4 fontFamily=$font-mono fontSize=12 fontWeight=normal}  ← "AK"
      frame "UN" {layout=vertical gap=1}
        text "n" {fill=#FFFFFF fontFamily=$font-body fontSize=13 fontWeight=normal}  ← "Aylin K."
        text "r" {fill=#7C8896 fontFamily=$font-mono fontSize=10 fontWeight=normal}  ← "Administrator"
  frame "Admin Main" {width=fill_container height=fill_container fill=$surface layout=vertical}
    frame "Topbar" {width=fill_container stroke=$border-subtle strokeWidth={"bottom":1} padding=[22,32] justifyContent=space_between alignItems=center}
      frame "Title" {layout=vertical gap=3}
        text "H" {fill=$ink fontFamily=$font-heading fontSize=24 fontWeight=700}  ← "Inquiries"
        text "Sub" {fill=$muted fontFamily=$font-mono fontSize=12 fontWeight=normal}  ← "128 total  ·  4 new this week"
      frame "TopActions" {gap=12 alignItems=center}
        frame "Search" {width=240 stroke=$border-subtle strokeWidth=1 gap=8 padding=[9,14] alignItems=center}
          icon "si" {width=16 height=16 fill=$muted icon=search}
          text "sp" {width=fill_container fill=$muted fontFamily=$font-body fontSize=13 fontWeight=normal textGrowth=fixed-width}  ← "Search inquiries…"
        frame "Export" {fill=$accent gap=8 padding=[10,18] alignItems=center}
          icon "ei" {width=16 height=16 fill=#FFFFFF icon=download}
          text "el" {fill=#FFFFFF fontFamily=$font-body fontSize=14 fontWeight=600}  ← "Export CSV"
    frame "Status Tabs" {width=fill_container stroke=$border-subtle strokeWidth={"bottom":1} gap=4 padding=[0,32] alignItems=center}
      frame "All" {stroke=$accent strokeWidth={"bottom":2} gap=7 padding=14 alignItems=center}
        text "l" {fill=$ink fontFamily=$font-body fontSize=14 fontWeight=600}  ← "All"
        text "c" {fill=$muted fontFamily=$font-mono fontSize=11 fontWeight=normal}  ← "128"
      frame "New" {stroke=#00000000 gap=7 padding=14 alignItems=center}
        text "l" {fill=$ink-2 fontFamily=$font-body fontSize=14}  ← "New"
        text "c" {fill=$muted fontFamily=$font-mono fontSize=11 fontWeight=normal}  ← "4"
      frame "In review" {stroke=#00000000 gap=7 padding=14 alignItems=center}
        text "l" {fill=$ink-2 fontFamily=$font-body fontSize=14}  ← "In review"
        text "c" {fill=$muted fontFamily=$font-mono fontSize=11 fontWeight=normal}  ← "9"
      frame "Quoted" {stroke=#00000000 gap=7 padding=14 alignItems=center}
        text "l" {fill=$ink-2 fontFamily=$font-body fontSize=14}  ← "Quoted"
        text "c" {fill=$muted fontFamily=$font-mono fontSize=11 fontWeight=normal}  ← "22"
      frame "Closed" {stroke=#00000000 gap=7 padding=14 alignItems=center}
        text "l" {fill=$ink-2 fontFamily=$font-body fontSize=14}  ← "Closed"
        text "c" {fill=$muted fontFamily=$font-mono fontSize=11 fontWeight=normal}  ← "93"
    frame "Leads Table" {width=fill_container layout=vertical padding=[8,32,32,32]}
      frame "Header Row" {width=fill_container stroke=$border-subtle strokeWidth={"bottom":1} gap=16 padding=12 alignItems=center}
        frame "h-REF" {width=140}
          text "t" {fill=$muted fontFamily=$font-mono fontSize=11 fontWeight=normal letterSpacing=1}  ← "REF"
        frame "h-RECEIVED" {width=96}
          text "t" {fill=$muted fontFamily=$font-mono fontSize=11 fontWeight=normal letterSpacing=1}  ← "RECEIVED"
        frame "h-COMPANY" {width=fill_container}
          text "t" {fill=$muted fontFamily=$font-mono fontSize=11 fontWeight=normal letterSpacing=1}  ← "COMPANY"
        frame "h-INDUSTRY" {width=150}
          text "t" {fill=$muted fontFamily=$font-mono fontSize=11 fontWeight=normal letterSpacing=1}  ← "INDUSTRY"
        frame "h-EQUIPMENT" {width=180}
          text "t" {fill=$muted fontFamily=$font-mono fontSize=11 fontWeight=normal letterSpacing=1}  ← "EQUIPMENT"
        frame "h-STATUS" {width=120}
          text "t" {fill=$muted fontFamily=$font-mono fontSize=11 fontWeight=normal letterSpacing=1}  ← "STATUS"
        frame "h-act" {width=44}
          text "t" {fill=$muted fontFamily=$font-mono fontSize=11 fontWeight=normal letterSpacing=1}
      frame "GLH-RFQ-2041" {width=fill_container stroke=$border-subtle strokeWidth={"bottom":1} gap=16 padding=[14,12] alignItems=center}
        frame "c-ref" {width=140}
          text "t" {fill=$accent fontFamily=$font-mono fontSize=12 fontWeight=normal}  ← "GLH-RFQ-2041"
        frame "c-date" {width=96}
          text "t" {fill=$ink-2 fontFamily=$font-mono fontSize=12 fontWeight=normal}  ← "27 Jul"
        frame "c-co" {width=fill_container}
          text "t" {width=fill_container fill=$ink fontFamily=$font-body fontSize=14 fontWeight=600 textGrowth=fixed-width}  ← "Akkuyu EPC"
        frame "c-ind" {width=150}
          text "t" {fill=$ink-2 fontFamily=$font-body fontSize=13 fontWeight=normal}  ← "Nuclear"
        frame "c-eq" {width=180}
          text "t" {fill=$ink-2 fontFamily=$font-body fontSize=13 fontWeight=normal}  ← "Fire suppression"
        frame "c-st" {width=120}
          frame "pill" {fill=$brand padding=[4,10] alignItems=center}
            text "pt" {fill=#FFFFFF fontFamily=$font-mono fontSize=11 fontWeight=normal}  ← "New"
        frame "c-act" {width=44 justifyContent=center}
          icon "chev" {width=18 height=18 fill=$muted icon=chevron-right}
      frame "GLH-RFQ-2040" {width=fill_container stroke=$border-subtle strokeWidth={"bottom":1} gap=16 padding=[14,12] alignItems=center}
        frame "c-ref" {width=140}
          text "t" {fill=$accent fontFamily=$font-mono fontSize=12 fontWeight=normal}  ← "GLH-RFQ-2040"
        frame "c-date" {width=96}
          text "t" {fill=$ink-2 fontFamily=$font-mono fontSize=12 fontWeight=normal}  ← "27 Jul"
        frame "c-co" {width=fill_container}
          text "t" {width=fill_container fill=$ink fontFamily=$font-body fontSize=14 fontWeight=600 textGrowth=fixed-width}  ← "Botaş"
        frame "c-ind" {width=150}
          text "t" {fill=$ink-2 fontFamily=$font-body fontSize=13 fontWeight=normal}  ← "Oil & Gas"
        frame "c-eq" {width=180}
          text "t" {fill=$ink-2 fontFamily=$font-body fontSize=13 fontWeight=normal}  ← "Gas detection"
        frame "c-st" {width=120}
          frame "pill" {fill=$brand padding=[4,10] alignItems=center}
            text "pt" {fill=#FFFFFF fontFamily=$font-mono fontSize=11 fontWeight=normal}  ← "New"
        frame "c-act" {width=44 justifyContent=center}
          icon "chev" {width=18 height=18 fill=$muted icon=chevron-right}
      frame "GLH-RFQ-2038" {width=fill_container stroke=$border-subtle strokeWidth={"bottom":1} gap=16 padding=[14,12] alignItems=center}
        frame "c-ref" {width=140}
          text "t" {fill=$accent fontFamily=$font-mono fontSize=12 fontWeight=normal}  ← "GLH-RFQ-2038"
        frame "c-date" {width=96}
          text "t" {fill=$ink-2 fontFamily=$font-mono fontSize=12 fontWeight=normal}  ← "26 Jul"
        frame "c-co" {width=fill_container}
          text "t" {width=fill_container fill=$ink fontFamily=$font-body fontSize=14 fontWeight=600 textGrowth=fixed-width}  ← "Şişecam"
        frame "c-ind" {width=150}
          text "t" {fill=$ink-2 fontFamily=$font-body fontSize=13 fontWeight=normal}  ← "Manufacturing"
        frame "c-eq" {width=180}
          text "t" {fill=$ink-2 fontFamily=$font-body fontSize=13 fontWeight=normal}  ← "Protective equip."
        frame "c-st" {width=120}
          frame "pill" {fill=#C2870B padding=[4,10] alignItems=center}
            text "pt" {fill=#FFFFFF fontFamily=$font-mono fontSize=11 fontWeight=normal}  ← "In review"
        frame "c-act" {width=44 justifyContent=center}
          icon "chev" {width=18 height=18 fill=$muted icon=chevron-right}
      frame "GLH-RFQ-2035" {width=fill_container stroke=$border-subtle strokeWidth={"bottom":1} gap=16 padding=[14,12] alignItems=center}
        frame "c-ref" {width=140}
          text "t" {fill=$accent fontFamily=$font-mono fontSize=12 fontWeight=normal}  ← "GLH-RFQ-2035"
        frame "c-date" {width=96}
          text "t" {fill=$ink-2 fontFamily=$font-mono fontSize=12 fontWeight=normal}  ← "25 Jul"
        frame "c-co" {width=fill_container}
          text "t" {width=fill_container fill=$ink fontFamily=$font-body fontSize=14 fontWeight=600 textGrowth=fixed-width}  ← "Enka İnşaat"
        frame "c-ind" {width=150}
          text "t" {fill=$ink-2 fontFamily=$font-body fontSize=13 fontWeight=normal}  ← "Construction"
        frame "c-eq" {width=180}
          text "t" {fill=$ink-2 fontFamily=$font-body fontSize=13 fontWeight=normal}  ← "Sprinkler system"
        frame "c-st" {width=120}
          frame "pill" {fill=#C2870B padding=[4,10] alignItems=center}
            text "pt" {fill=#FFFFFF fontFamily=$font-mono fontSize=11 fontWeight=normal}  ← "In review"
        frame "c-act" {width=44 justifyContent=center}
          icon "chev" {width=18 height=18 fill=$muted icon=chevron-right}
      frame "GLH-RFQ-2031" {width=fill_container stroke=$border-subtle strokeWidth={"bottom":1} gap=16 padding=[14,12] alignItems=center}
        frame "c-ref" {width=140}
          text "t" {fill=$accent fontFamily=$font-mono fontSize=12 fontWeight=normal}  ← "GLH-RFQ-2031"
        frame "c-date" {width=96}
          text "t" {fill=$ink-2 fontFamily=$font-mono fontSize=12 fontWeight=normal}  ← "24 Jul"
        frame "c-co" {width=fill_container}
          text "t" {width=fill_container fill=$ink fontFamily=$font-body fontSize=14 fontWeight=600 textGrowth=fixed-width}  ← "TPAO"
        frame "c-ind" {width=150}
          text "t" {fill=$ink-2 fontFamily=$font-body fontSize=13 fontWeight=normal}  ← "Energy"
        frame "c-eq" {width=180}
          text "t" {fill=$ink-2 fontFamily=$font-body fontSize=13 fontWeight=normal}  ← "PLC control"
        frame "c-st" {width=120}
          frame "pill" {fill=$accent padding=[4,10] alignItems=center}
            text "pt" {fill=#FFFFFF fontFamily=$font-mono fontSize=11 fontWeight=normal}  ← "Quoted"
        frame "c-act" {width=44 justifyContent=center}
          icon "chev" {width=18 height=18 fill=$muted icon=chevron-right}
      frame "GLH-RFQ-2028" {width=fill_container stroke=$border-subtle strokeWidth={"bottom":1} gap=16 padding=[14,12] alignItems=center}
        frame "c-ref" {width=140}
          text "t" {fill=$accent fontFamily=$font-mono fontSize=12 fontWeight=normal}  ← "GLH-RFQ-2028"
        frame "c-date" {width=96}
          text "t" {fill=$ink-2 fontFamily=$font-mono fontSize=12 fontWeight=normal}  ← "23 Jul"
        frame "c-co" {width=fill_container}
          text "t" {width=fill_container fill=$ink fontFamily=$font-body fontSize=14 fontWeight=600 textGrowth=fixed-width}  ← "Arçelik"
        frame "c-ind" {width=150}
          text "t" {fill=$ink-2 fontFamily=$font-body fontSize=13 fontWeight=normal}  ← "Manufacturing"
        frame "c-eq" {width=180}
          text "t" {fill=$ink-2 fontFamily=$font-body fontSize=13 fontWeight=normal}  ← "SCBA units"
        frame "c-st" {width=120}
          frame "pill" {fill=$accent padding=[4,10] alignItems=center}
            text "pt" {fill=#FFFFFF fontFamily=$font-mono fontSize=11 fontWeight=normal}  ← "Quoted"
        frame "c-act" {width=44 justifyContent=center}
          icon "chev" {width=18 height=18 fill=$muted icon=chevron-right}
      frame "GLH-RFQ-2025" {width=fill_container stroke=$border-subtle strokeWidth={"bottom":1} gap=16 padding=[14,12] alignItems=center}
        frame "c-ref" {width=140}
          text "t" {fill=$accent fontFamily=$font-mono fontSize=12 fontWeight=normal}  ← "GLH-RFQ-2025"
        frame "c-date" {width=96}
          text "t" {fill=$ink-2 fontFamily=$font-mono fontSize=12 fontWeight=normal}  ← "22 Jul"
        frame "c-co" {width=fill_container}
          text "t" {width=fill_container fill=$ink fontFamily=$font-body fontSize=14 fontWeight=600 textGrowth=fixed-width}  ← "Limak İnşaat"
        frame "c-ind" {width=150}
          text "t" {fill=$ink-2 fontFamily=$font-body fontSize=13 fontWeight=normal}  ← "Construction"
        frame "c-eq" {width=180}
          text "t" {fill=$ink-2 fontFamily=$font-body fontSize=13 fontWeight=normal}  ← "Fire panel"
        frame "c-st" {width=120}
          frame "pill" {fill=$muted padding=[4,10] alignItems=center}
            text "pt" {fill=#FFFFFF fontFamily=$font-mono fontSize=11 fontWeight=normal}  ← "Closed"
        frame "c-act" {width=44 justifyContent=center}
          icon "chev" {width=18 height=18 fill=$muted icon=chevron-right}
```

### RFQ — Desktop  `#ZZvB7`

```
frame "RFQ — Desktop" {width=1440 fill=$surface-2 layout=vertical}
  frame "Top Nav" {width=fill_container fill=$surface stroke=$border-subtle strokeWidth={"bottom":1} padding=[20,100] justifyContent=space_between alignItems=center}
    frame "Brand" {gap=10 alignItems=center}
      frame "Mark" {width=26 height=26 fill=$brand justifyContent=center alignItems=center}
        text "MarkGlyph" {fill=#FFFFFF fontFamily=$font-heading fontSize=16 fontWeight=700}  ← "G"
      text "Wordmark" {fill=$ink fontFamily=$font-heading fontSize=16 fontWeight=700 letterSpacing=0.5}  ← "GREENLIGHTHOUSE"
    frame "Nav Links" {gap=28 alignItems=center}
      text "Industries" {fill=$ink-2 fontFamily=$font-body fontSize=14 fontWeight=normal}  ← "Industries"
      text "Products" {fill=$ink-2 fontFamily=$font-body fontSize=14 fontWeight=normal}  ← "Products"
      text "Projects" {fill=$ink-2 fontFamily=$font-body fontSize=14 fontWeight=normal}  ← "Projects"
      text "Services" {fill=$ink-2 fontFamily=$font-body fontSize=14 fontWeight=normal}  ← "Services"
      text "About" {fill=$ink-2 fontFamily=$font-body fontSize=14 fontWeight=normal}  ← "About"
    frame "Actions" {gap=16 alignItems=center}
      frame "Lang" {gap=6 alignItems=center}
        text "EN" {fill=$ink fontFamily=$font-mono fontSize=12 fontWeight=normal}  ← "EN"
        text "Sep1" {fill=$muted fontFamily=$font-mono fontSize=12 fontWeight=normal}  ← "/"
        text "TR" {fill=$muted fontFamily=$font-mono fontSize=12 fontWeight=normal}  ← "TR"
        text "Sep2" {fill=$muted fontFamily=$font-mono fontSize=12 fontWeight=normal}  ← "/"
        text "RU" {fill=$muted fontFamily=$font-mono fontSize=12 fontWeight=normal}  ← "RU"
      text "Phone" {fill=$ink fontFamily=$font-mono fontSize=13 fontWeight=normal}  ← "+90 212 000 00 00"
      frame "Nav CTA" {fill=$accent padding=[10,18] alignItems=center}
        text "CTA Label" {fill=#FFFFFF fontFamily=$font-body fontSize=14 fontWeight=600}  ← "Request Project Quote"
  frame "RFQ Content" {width=fill_container gap=44 padding=[44,100]}
    frame "Form Col" {width=fill_container layout=vertical gap=24}
      frame "RFQ Head" {width=fill_container layout=vertical gap=8}
        text "H1" {fill=$ink fontFamily=$font-heading fontSize=34 fontWeight=700 letterSpacing=-0.5}  ← "Request a project quote"
        text "Sub" {width=fill_container fill=$ink-2 fontFamily=$font-body fontSize=15 fontWeight=normal lineHeight=1.5 textGrowth=fixed-width}  ← "Tell us the project. We reply with a technical review in 24h and a specced proposal in 3 w"
      frame "Prefill Banner" {width=fill_container fill=$surface stroke=$accent strokeWidth={"left":3} gap=12 padding=[12,16] justifyContent=space_between alignItems=center}
        frame "pfl" {gap=10 alignItems=center}
          icon "i" {width=16 height=16 fill=$accent icon=sparkles}
          text "t" {fill=$ink fontFamily=$font-body fontSize=13 fontWeight=normal}  ← "Pre-filled from your project: Fire-suppression system · Logistics"
        text "clr" {fill=$accent fontFamily=$font-body fontSize=13 fontWeight=600}  ← "Clear"
      frame "1 · Your project" {width=fill_container fill=$surface stroke=$border-subtle strokeWidth=1 layout=vertical}
        frame "head" {width=fill_container stroke=$border-subtle strokeWidth={"bottom":1} padding=[16,20]}
          text "t" {fill=$ink fontFamily=$font-heading fontSize=16 fontWeight=600}  ← "1 · Your project"
        frame "body" {width=fill_container layout=vertical gap=18 padding=20}
          frame "row1" {width=fill_container gap=16}
            frame "INDUSTRY" {width=fill_container layout=vertical gap=7}
              text "lbl" {fill=$muted fontFamily=$font-mono fontSize=11 fontWeight=normal letterSpacing=1}  ← "INDUSTRY"
              frame "box" {width=fill_container fill=$surface stroke=$border-subtle strokeWidth=1 padding=[11,14] justifyContent=space_between alignItems=center}
                text "v" {width=fill_container fill=$ink fontFamily=$font-body fontSize=14 fontWeight=normal textGrowth=fixed-width}  ← "Logistics"
                icon "chev" {width=16 height=16 fill=$ink-2 icon=chevron-down}
            frame "TIMELINE" {width=fill_container layout=vertical gap=7}
              text "lbl" {fill=$muted fontFamily=$font-mono fontSize=11 fontWeight=normal letterSpacing=1}  ← "TIMELINE"
              frame "box" {width=fill_container fill=$surface stroke=$border-subtle strokeWidth=1 padding=[11,14] justifyContent=space_between alignItems=center}
                text "v" {width=fill_container fill=$ink fontFamily=$font-body fontSize=14 fontWeight=normal textGrowth=fixed-width}  ← "Select timeline…"
                icon "chev" {width=16 height=16 fill=$ink-2 icon=chevron-down}
          frame "EQUIPMENT" {width=fill_container layout=vertical gap=7}
            text "lbl" {fill=$muted fontFamily=$font-mono fontSize=11 fontWeight=normal letterSpacing=1}  ← "EQUIPMENT"
            frame "box" {width=fill_container fill=$surface stroke=$border-subtle strokeWidth=1 gap=8 padding=[10,12] alignItems=center}
              frame "Fire suppression" {fill=$surface-2 stroke=$border-subtle strokeWidth=1 gap=6 padding=[5,10] alignItems=center}
                text "t" {fill=$ink fontFamily=$font-body fontSize=13 fontWeight=normal}  ← "Fire suppression"
                icon "x" {width=13 height=13 fill=$muted icon=x}
              frame "Detection panels" {fill=$surface-2 stroke=$border-subtle strokeWidth=1 gap=6 padding=[5,10] alignItems=center}
                text "t" {fill=$ink fontFamily=$font-body fontSize=13 fontWeight=normal}  ← "Detection panels"
                icon "x" {width=13 height=13 fill=$muted icon=x}
              text "add" {fill=$accent fontFamily=$font-body fontSize=13 fontWeight=normal}  ← "+ Add equipment"
          frame "DESCRIPTION" {width=fill_container layout=vertical gap=7}
            text "lbl" {fill=$muted fontFamily=$font-mono fontSize=11 fontWeight=normal letterSpacing=1}  ← "PROJECT DESCRIPTION"
            frame "box" {width=fill_container height=96 fill=$surface stroke=$border-subtle strokeWidth=1 layout=vertical padding=[12,14]}
              text "v" {width=fill_container fill=$muted fontFamily=$font-body fontSize=14 fontWeight=normal lineHeight=1.5 textGrowth=fixed-width}  ← "Scope, standards, site conditions, delivery location…"
          frame "ATTACHMENT" {width=fill_container layout=vertical gap=7}
            text "lbl" {fill=$muted fontFamily=$font-mono fontSize=11 fontWeight=normal letterSpacing=1}  ← "SPEC / DRAWING (OPTIONAL)"
            frame "Dropzone" {width=fill_container fill=$surface-2 stroke=$muted strokeWidth=1 gap=10 padding=[18,16] justifyContent=center alignItems=center}
              icon "u" {width=20 height=20 fill=$ink-2 icon=cloud-upload}
              text "t" {fill=$ink-2 fontFamily=$font-body fontSize=13 fontWeight=normal}  ← "Drop a spec or drawing, or browse  ·  PDF / XLSX / DWG, ≤ 15 MB"
      frame "2 · Your details" {width=fill_container fill=$surface stroke=$border-subtle strokeWidth=1 layout=vertical}
        frame "head" {width=fill_container stroke=$border-subtle strokeWidth={"bottom":1} padding=[16,20]}
          text "t" {fill=$ink fontFamily=$font-heading fontSize=16 fontWeight=600}  ← "2 · Your details"
        frame "body" {width=fill_container layout=vertical gap=18 padding=20}
          frame "d1" {width=fill_container gap=16}
            frame "FULL NAME" {width=fill_container layout=vertical gap=7}
              text "lbl" {fill=$muted fontFamily=$font-mono fontSize=11 fontWeight=normal letterSpacing=1}  ← "FULL NAME"
              frame "box" {width=fill_container fill=$surface stroke=$border-subtle strokeWidth=1 padding=[11,14] justifyContent=space_between alignItems=center}
                text "v" {width=fill_container fill=$muted fontFamily=$font-body fontSize=14 fontWeight=normal textGrowth=fixed-width}  ← "e.g. Elena Petrova"
            frame "COMPANY" {width=fill_container layout=vertical gap=7}
              text "lbl" {fill=$muted fontFamily=$font-mono fontSize=11 fontWeight=normal letterSpacing=1}  ← "COMPANY"
              frame "box" {width=fill_container fill=$surface stroke=$border-subtle strokeWidth=1 padding=[11,14] justifyContent=space_between alignItems=center}
                text "v" {width=fill_container fill=$muted fontFamily=$font-body fontSize=14 fontWeight=normal textGrowth=fixed-width}  ← "e.g. Enka EPC"
          frame "d2" {width=fill_container gap=16}
            frame "WORK EMAIL" {width=fill_container layout=vertical gap=7}
              text "lbl" {fill=$muted fontFamily=$font-mono fontSize=11 fontWeight=normal letterSpacing=1}  ← "WORK EMAIL"
              frame "box" {width=fill_container fill=$surface stroke=$border-subtle strokeWidth=1 padding=[11,14] justifyContent=space_between alignItems=center}
                text "v" {width=fill_container fill=$muted fontFamily=$font-body fontSize=14 fontWeight=normal textGrowth=fixed-width}  ← "you@company.com"
            frame "PHONE" {width=fill_container layout=vertical gap=7}
              text "lbl" {fill=$muted fontFamily=$font-mono fontSize=11 fontWeight=normal letterSpacing=1}  ← "PHONE"
              frame "box" {width=fill_container fill=$surface stroke=$border-subtle strokeWidth=1 padding=[11,14] justifyContent=space_between alignItems=center}
                text "v" {width=fill_container fill=$muted fontFamily=$font-body fontSize=14 fontWeight=normal textGrowth=fixed-width}  ← "+90 / +7 / …"
          frame "d3" {width=fill_container gap=16}
            frame "COUNTRY" {width=fill_container layout=vertical gap=7}
              text "lbl" {fill=$muted fontFamily=$font-mono fontSize=11 fontWeight=normal letterSpacing=1}  ← "COUNTRY"
              frame "box" {width=fill_container fill=$surface stroke=$border-subtle strokeWidth=1 padding=[11,14] justifyContent=space_between alignItems=center}
                text "v" {width=fill_container fill=$ink fontFamily=$font-body fontSize=14 fontWeight=normal textGrowth=fixed-width}  ← "Turkey"
                icon "chev" {width=16 height=16 fill=$ink-2 icon=chevron-down}
            frame "PREFERRED LANGUAGE" {width=fill_container layout=vertical gap=7}
              text "lbl" {fill=$muted fontFamily=$font-mono fontSize=11 fontWeight=normal letterSpacing=1}  ← "PREFERRED LANGUAGE"
              frame "box" {width=fill_container fill=$surface stroke=$border-subtle strokeWidth=1 padding=[11,14] justifyContent=space_between alignItems=center}
                text "v" {width=fill_container fill=$ink fontFamily=$font-body fontSize=14 fontWeight=normal textGrowth=fixed-width}  ← "English"
                icon "chev" {width=16 height=16 fill=$ink-2 icon=chevron-down}
      frame "Submit Block" {width=fill_container layout=vertical gap=16}
        frame "Consent" {width=fill_container gap=10}
          frame "cbox" {width=18 height=18 fill=$surface stroke=$ink strokeWidth=1.5}
          text "ctext" {width=fill_container fill=$ink-2 fontFamily=$font-body fontSize=13 fontWeight=normal lineHeight=1.5 textGrowth=fixed-width}  ← "I agree that GREENLIGHTHOUSE may process the details above to respond to my inquiry, per t"
        frame "Submit Row" {width=fill_container gap=16 alignItems=center}
          frame "SubmitBtn" {fill=$accent gap=8 padding=[14,26] alignItems=center}
            text "l" {fill=#FFFFFF fontFamily=$font-body fontSize=15 fontWeight=600}  ← "Send project inquiry"
            icon "a" {width=16 height=16 fill=#FFFFFF icon=arrow-right}
          text "note" {width=fill_container fill=$muted fontFamily=$font-body fontSize=13 fontWeight=normal textGrowth=fixed-width}  ← "You'll get an instant confirmation. A GLH engineer reviews within 24h."
    frame "RFQ Side" {width=360 layout=vertical gap=20}
      frame "SLA Card" {width=fill_container fill=$ink layout=vertical gap=18 padding=24}
        text "k" {fill=$accent-soft fontFamily=$font-mono fontSize=11 fontWeight=normal letterSpacing=1.5}  ← "WHAT HAPPENS NEXT"
        frame "Technical review" {width=fill_container gap=14}
          frame "n" {width=46 height=34 stroke=$accent-soft strokeWidth=1 justifyContent=center alignItems=center}
            text "nt" {fill=$accent-soft fontFamily=$font-data fontSize=14 fontWeight=normal}  ← "24h"
          frame "tc" {width=fill_container layout=vertical gap=3}
            text "tt" {fill=#FFFFFF fontFamily=$font-body fontSize=14 fontWeight=600}  ← "Technical review"
            text "td" {width=fill_container fill=#9AA6B4 fontFamily=$font-body fontSize=13 fontWeight=normal lineHeight=1.45 textGrowth=fixed-width}  ← "An engineer checks fit, spec & compliance."
        frame "Spec + proposal" {width=fill_container gap=14}
          frame "n" {width=46 height=34 stroke=$accent-soft strokeWidth=1 justifyContent=center alignItems=center}
            text "nt" {fill=$accent-soft fontFamily=$font-data fontSize=14 fontWeight=normal}  ← "3 days"
          frame "tc" {width=fill_container layout=vertical gap=3}
            text "tt" {fill=#FFFFFF fontFamily=$font-body fontSize=14 fontWeight=600}  ← "Spec + proposal"
            text "td" {width=fill_container fill=#9AA6B4 fontFamily=$font-body fontSize=13 fontWeight=normal lineHeight=1.45 textGrowth=fixed-width}  ← "Itemised package for your exact scope."
        frame "Formal quote" {width=fill_container gap=14}
          frame "n" {width=46 height=34 stroke=$accent-soft strokeWidth=1 justifyContent=center alignItems=center}
            text "nt" {fill=$accent-soft fontFamily=$font-data fontSize=14 fontWeight=normal}  ← "→"
          frame "tc" {width=fill_container layout=vertical gap=3}
            text "tt" {fill=#FFFFFF fontFamily=$font-body fontSize=14 fontWeight=600}  ← "Formal quote"
            text "td" {width=fill_container fill=#9AA6B4 fontFamily=$font-body fontSize=13 fontWeight=normal lineHeight=1.45 textGrowth=fixed-width}  ← "Costed, with lead times & logistics."
      frame "Talk Card" {width=fill_container fill=$surface stroke=$border-subtle strokeWidth=1 layout=vertical gap=12 padding=20}
        text "t" {fill=$ink fontFamily=$font-heading fontSize=17 fontWeight=600}  ← "Prefer to talk?"
        text "ph" {fill=$accent fontFamily=$font-mono fontSize=20 fontWeight=normal}  ← "+90 212 000 00 00"
        text "hrs" {fill=$ink-2 fontFamily=$font-body fontSize=13 fontWeight=normal}  ← "Mon–Fri · answered in EN / TR / RU"
        frame "CallBtn" {stroke=$ink strokeWidth=1.5 gap=8 padding=[11,18] alignItems=center}
          icon "p" {width=16 height=16 fill=$ink icon=phone}
          text "l" {fill=$ink fontFamily=$font-body fontSize=14 fontWeight=600}  ← "Call an engineer"
      frame "Why Card" {width=fill_container fill=$surface-2 layout=vertical gap=12 padding=18}
        text "k" {fill=$muted fontFamily=$font-mono fontSize=11 fontWeight=normal letterSpacing=1.5}  ← "WHY NO PRICES?"
        text "b" {width=fill_container fill=$ink-2 fontFamily=$font-body fontSize=13 fontWeight=normal lineHeight=1.5 textGrowth=fixed-width}  ← "Project supply is specced, not shelf-priced. You get an accurate quote for your exact scop"
        frame "Certs" {width=fill_container gap=12 alignItems=center}
          text "ISO 9001" {fill=$ink fontFamily=$font-mono fontSize=12 fontWeight=normal}  ← "ISO 9001"
          text "CE" {fill=$ink fontFamily=$font-mono fontSize=12 fontWeight=normal}  ← "CE"
          text "EN" {fill=$ink fontFamily=$font-mono fontSize=12 fontWeight=normal}  ← "EN"
          text "A.TR" {fill=$ink fontFamily=$font-mono fontSize=12 fontWeight=normal}  ← "A.TR"
```

### Product Detail — Desktop  `#W3Xb6`

```
frame "Product Detail — Desktop" {width=1440 fill=$surface layout=vertical}
  frame "Top Nav" {width=fill_container fill=$surface stroke=$border-subtle strokeWidth={"bottom":1} padding=[20,100] justifyContent=space_between alignItems=center}
    frame "Brand" {gap=10 alignItems=center}
      frame "Mark" {width=26 height=26 fill=$brand justifyContent=center alignItems=center}
        text "MarkGlyph" {fill=#FFFFFF fontFamily=$font-heading fontSize=16 fontWeight=700}  ← "G"
      text "Wordmark" {fill=$ink fontFamily=$font-heading fontSize=16 fontWeight=700 letterSpacing=0.5}  ← "GREENLIGHTHOUSE"
    frame "Nav Links" {gap=28 alignItems=center}
      text "Industries" {fill=$ink-2 fontFamily=$font-body fontSize=14 fontWeight=normal}  ← "Industries"
      text "Products" {fill=$ink fontFamily=$font-body fontSize=14 fontWeight=600}  ← "Products"
      text "Projects" {fill=$ink-2 fontFamily=$font-body fontSize=14 fontWeight=normal}  ← "Projects"
      text "Services" {fill=$ink-2 fontFamily=$font-body fontSize=14 fontWeight=normal}  ← "Services"
      text "About" {fill=$ink-2 fontFamily=$font-body fontSize=14 fontWeight=normal}  ← "About"
    frame "Actions" {gap=16 alignItems=center}
      frame "Lang" {gap=6 alignItems=center}
        text "EN" {fill=$ink fontFamily=$font-mono fontSize=12 fontWeight=normal}  ← "EN"
        text "Sep1" {fill=$muted fontFamily=$font-mono fontSize=12 fontWeight=normal}  ← "/"
        text "TR" {fill=$muted fontFamily=$font-mono fontSize=12 fontWeight=normal}  ← "TR"
        text "Sep2" {fill=$muted fontFamily=$font-mono fontSize=12 fontWeight=normal}  ← "/"
        text "RU" {fill=$muted fontFamily=$font-mono fontSize=12 fontWeight=normal}  ← "RU"
      text "Phone" {fill=$ink fontFamily=$font-mono fontSize=13 fontWeight=normal}  ← "+90 212 000 00 00"
      frame "Nav CTA" {fill=$accent padding=[10,18] alignItems=center}
        text "CTA Label" {fill=#FFFFFF fontFamily=$font-body fontSize=14 fontWeight=600}  ← "Request Project Quote"
  frame "Breadcrumb" {width=fill_container fill=$surface-2 stroke=$border-subtle strokeWidth={"bottom":1} gap=8 padding=[14,100] alignItems=center}
    text "Products" {fill=$muted fontFamily=$font-mono fontSize=12 fontWeight=normal}  ← "Products"
    text "sep0" {fill=$border-subtle fontFamily=$font-mono fontSize=12 fontWeight=normal}  ← "/"
    text "Fire Detection" {fill=$muted fontFamily=$font-mono fontSize=12 fontWeight=normal}  ← "Fire Detection"
    text "sep1" {fill=$border-subtle fontFamily=$font-mono fontSize=12 fontWeight=normal}  ← "/"
    text "Flame Detectors" {fill=$muted fontFamily=$font-mono fontSize=12 fontWeight=normal}  ← "Flame Detectors"
    text "sep2" {fill=$border-subtle fontFamily=$font-mono fontSize=12 fontWeight=normal}  ← "/"
    text "FD-9500" {fill=$ink fontFamily=$font-mono fontSize=12 fontWeight=normal}  ← "FD-9500"
  frame "Hero" {width=fill_container fill=$surface gap=44 padding=[40,100]}
    frame "Gallery" {width=fill_container layout=vertical gap=12}
      frame "Main Image" {width=fill_container height=440 fill=$surface-2 stroke=$border-subtle strokeWidth=1 layout=vertical justifyContent=center alignItems=center}
        icon "ProdIcon" {width=104 height=104 fill=$ink-2 icon=flame}
        frame "CapBar" {width=776 padding=[12,14] justifyContent=space_between}
          text "fig" {fill=$muted fontFamily=$font-mono fontSize=11 fontWeight=normal letterSpacing=0.5}  ← "FIG. 1 — FD-9500 · FIELD UNIT"
          text "count" {fill=$muted fontFamily=$font-mono fontSize=11 fontWeight=normal}  ← "1 / 4"
      frame "Thumbs" {width=fill_container gap=10}
        frame "thumb0" {width=80 height=80 fill=$surface-2 stroke=$accent strokeWidth=1.5 layout=vertical justifyContent=center alignItems=center}
          icon "ic" {width=26 height=26 fill=$accent icon=flame}
        frame "thumb1" {width=80 height=80 fill=$surface-2 stroke=$border-subtle strokeWidth=1 layout=vertical justifyContent=center alignItems=center}
          icon "ic" {width=26 height=26 fill=$muted icon=box}
        frame "thumb2" {width=80 height=80 fill=$surface-2 stroke=$border-subtle strokeWidth=1 layout=vertical justifyContent=center alignItems=center}
          icon "ic" {width=26 height=26 fill=$muted icon=git-compare}
        frame "thumb3" {width=80 height=80 fill=$surface-2 stroke=$border-subtle strokeWidth=1 layout=vertical justifyContent=center alignItems=center}
          icon "ic" {width=26 height=26 fill=$muted icon=file-text}
    frame "Quote Box" {width=420 fill=$surface stroke=$border-subtle strokeWidth=1 layout=vertical gap=16 padding=24}
      text "Mfr" {fill=$muted fontFamily=$font-mono fontSize=11 fontWeight=normal letterSpacing=1.5}  ← "SENTRA FIRE SYSTEMS"
      text "Title" {width=fill_container fill=$ink fontFamily=$font-heading fontSize=27 fontWeight=700 lineHeight=1.15 letterSpacing=-0.4 textGrowth=fixed-width}  ← "Triple-IR (IR³) Flame Detector"
      text "Model" {fill=$ink-2 fontFamily=$font-data fontSize=12 fontWeight=normal letterSpacing=0.5}  ← "MODEL FD-9500   ·   SERIES FLAMEGUARD"
      text "Desc" {width=fill_container fill=$ink-2 fontFamily=$font-body fontSize=14 fontWeight=normal lineHeight=1.5 textGrowth=fixed-width}  ← "Explosion-proof triple-infrared flame detector for high-risk fire zones. Immune to false a"
      rectangle "div1" {width=fill_container height=1 fill=$border-subtle}
      frame "Quick Facts" {width=fill_container layout=vertical gap=11}
        frame "DETECTION" {width=fill_container gap=12 justifyContent=space_between alignItems=center}
          text "k" {fill=$muted fontFamily=$font-mono fontSize=11 fontWeight=normal letterSpacing=1}  ← "DETECTION"
          text "v" {fill=$ink fontFamily=$font-data fontSize=13 fontWeight=normal}  ← "Triple-IR (IR³)"
        frame "RESPONSE" {width=fill_container gap=12 justifyContent=space_between alignItems=center}
          text "k" {fill=$muted fontFamily=$font-mono fontSize=11 fontWeight=normal letterSpacing=1}  ← "RESPONSE"
          text "v" {fill=$ink fontFamily=$font-data fontSize=13 fontWeight=normal}  ← "< 5 s @ 25 ft"
        frame "ENCLOSURE" {width=fill_container gap=12 justifyContent=space_between alignItems=center}
          text "k" {fill=$muted fontFamily=$font-mono fontSize=11 fontWeight=normal letterSpacing=1}  ← "ENCLOSURE"
          text "v" {fill=$ink fontFamily=$font-data fontSize=13 fontWeight=normal}  ← "IP66 / IP67 · 316 SS"
        frame "HAZ. AREA" {width=fill_container gap=12 justifyContent=space_between alignItems=center}
          text "k" {fill=$muted fontFamily=$font-mono fontSize=11 fontWeight=normal letterSpacing=1}  ← "HAZ. AREA"
          text "v" {fill=$ink fontFamily=$font-data fontSize=13 fontWeight=normal}  ← "ATEX / IECEx Zone 1"
      rectangle "div2" {width=fill_container height=1 fill=$border-subtle}
      frame "Chips" {width=fill_container gap=8}
        frame "EN 54-10" {fill=$surface-2 stroke=$border-subtle strokeWidth=1 gap=6 padding=[5,10] alignItems=center}
          icon "ic" {width=13 height=13 fill=$brand icon=badge-check}
          text "t" {fill=$ink-2 fontFamily=$font-mono fontSize=11 fontWeight=normal}  ← "EN 54-10"
        frame "ATEX Zone 1" {fill=$surface-2 stroke=$border-subtle strokeWidth=1 gap=6 padding=[5,10] alignItems=center}
          icon "ic" {width=13 height=13 fill=$brand icon=badge-check}
          text "t" {fill=$ink-2 fontFamily=$font-mono fontSize=11 fontWeight=normal}  ← "ATEX Zone 1"
        frame "FM / CE" {fill=$surface-2 stroke=$border-subtle strokeWidth=1 gap=6 padding=[5,10] alignItems=center}
          icon "ic" {width=13 height=13 fill=$brand icon=badge-check}
          text "t" {fill=$ink-2 fontFamily=$font-mono fontSize=11 fontWeight=normal}  ← "FM / CE"
      frame "CTA Primary" {width=fill_container fill=$accent gap=8 padding=[13,20] justifyContent=center alignItems=center}
        text "lbl" {fill=#FFFFFF fontFamily=$font-body fontSize=15 fontWeight=600}  ← "Request a quote for this product"
      frame "CTA Secondary" {width=fill_container fill=$surface stroke=$ink strokeWidth=1.5 gap=8 padding=[12,20] justifyContent=center alignItems=center}
        icon "dl" {width=16 height=16 fill=$ink icon=download}
        text "lbl" {fill=$ink fontFamily=$font-body fontSize=14 fontWeight=600}  ← "Download datasheet  ·  PDF 1.8 MB"
      text "Trust" {width=fill_container fill=$muted fontFamily=$font-mono fontSize=11 fontWeight=normal textGrowth=fixed-width}  ← "No price shown — project-specced quote within 24 h."
  frame "Spec Section" {width=fill_container fill=$surface stroke=$border-subtle strokeWidth={"top":1} layout=vertical gap=24 padding=[44,100]}
    frame "Sec Head" {width=fill_container gap=20 justifyContent=space_between alignItems=end}
      frame "HeadL" {layout=vertical gap=6}
        text "kick" {fill=$accent-soft fontFamily=$font-mono fontSize=11 fontWeight=normal letterSpacing=1.5}  ← "01 — TECHNICAL SPECIFICATIONS"
        text "h2" {fill=$ink fontFamily=$font-heading fontSize=24 fontWeight=700 letterSpacing=-0.4}  ← "Full technical data"
      frame "DLlink" {gap=7 alignItems=center}
        icon "ic" {width=14 height=14 fill=$accent icon=download}
        text "t" {fill=$accent fontFamily=$font-body fontSize=13 fontWeight=600}  ← "Download full datasheet"
    frame "Spec Grid" {width=fill_container gap=64}
      frame "Col L" {width=fill_container layout=vertical gap=28}
        frame "GENERAL" {width=fill_container layout=vertical}
          frame "gh" {width=fill_container padding=[0,0,12,0]}
            text "gt" {fill=$muted fontFamily=$font-mono fontSize=11 fontWeight=normal letterSpacing=1.5}  ← "GENERAL"
          frame "Product type" {width=fill_container stroke=$border-subtle strokeWidth={"bottom":1} gap=24 padding=[10,0] justifyContent=space_between}
            text "k" {fill=$ink-2 fontFamily=$font-body fontSize=13 fontWeight=normal}  ← "Product type"
            text "v" {width=300 fill=$ink fontFamily=$font-data fontSize=13 fontWeight=normal textGrowth=fixed-width}  ← "IR³ flame detector"
          frame "Model" {width=fill_container stroke=$border-subtle strokeWidth={"bottom":1} gap=24 padding=[10,0] justifyContent=space_between}
            text "k" {fill=$ink-2 fontFamily=$font-body fontSize=13 fontWeight=normal}  ← "Model"
            text "v" {width=300 fill=$ink fontFamily=$font-data fontSize=13 fontWeight=normal textGrowth=fixed-width}  ← "FD-9500"
          frame "Series" {width=fill_container stroke=$border-subtle strokeWidth={"bottom":1} gap=24 padding=[10,0] justifyContent=space_between}
            text "k" {fill=$ink-2 fontFamily=$font-body fontSize=13 fontWeight=normal}  ← "Series"
            text "v" {width=300 fill=$ink fontFamily=$font-data fontSize=13 fontWeight=normal textGrowth=fixed-width}  ← "FlameGuard"
          frame "Housing material" {width=fill_container stroke=$border-subtle strokeWidth={"bottom":1} gap=24 padding=[10,0] justifyContent=space_between}
            text "k" {fill=$ink-2 fontFamily=$font-body fontSize=13 fontWeight=normal}  ← "Housing material"
            text "v" {width=300 fill=$ink fontFamily=$font-data fontSize=13 fontWeight=normal textGrowth=fixed-width}  ← "316 stainless steel"
          frame "Weight" {width=fill_container stroke=$border-subtle strokeWidth={"bottom":1} gap=24 padding=[10,0] justifyContent=space_between}
            text "k" {fill=$ink-2 fontFamily=$font-body fontSize=13 fontWeight=normal}  ← "Weight"
            text "v" {width=300 fill=$ink fontFamily=$font-data fontSize=13 fontWeight=normal textGrowth=fixed-width}  ← "2.4 kg"
        frame "OPTICAL / DETECTION" {width=fill_container layout=vertical}
          frame "gh" {width=fill_container padding=[0,0,12,0]}
            text "gt" {fill=$muted fontFamily=$font-mono fontSize=11 fontWeight=normal letterSpacing=1.5}  ← "OPTICAL / DETECTION"
          frame "Detection method" {width=fill_container stroke=$border-subtle strokeWidth={"bottom":1} gap=24 padding=[10,0] justifyContent=space_between}
            text "k" {fill=$ink-2 fontFamily=$font-body fontSize=13 fontWeight=normal}  ← "Detection method"
            text "v" {width=300 fill=$ink fontFamily=$font-data fontSize=13 fontWeight=normal textGrowth=fixed-width}  ← "Triple-IR (IR³)"
          frame "Field of view" {width=fill_container stroke=$border-subtle strokeWidth={"bottom":1} gap=24 padding=[10,0] justifyContent=space_between}
            text "k" {fill=$ink-2 fontFamily=$font-body fontSize=13 fontWeight=normal}  ← "Field of view"
            text "v" {width=300 fill=$ink fontFamily=$font-data fontSize=13 fontWeight=normal textGrowth=fixed-width}  ← "90° H · 110° V"
          frame "Sensitivity" {width=fill_container stroke=$border-subtle strokeWidth={"bottom":1} gap=24 padding=[10,0] justifyContent=space_between}
            text "k" {fill=$ink-2 fontFamily=$font-body fontSize=13 fontWeight=normal}  ← "Sensitivity"
            text "v" {width=300 fill=$ink fontFamily=$font-data fontSize=13 fontWeight=normal textGrowth=fixed-width}  ← "0.1 m² n-heptane @ 25 m"
          frame "Response time" {width=fill_container stroke=$border-subtle strokeWidth={"bottom":1} gap=24 padding=[10,0] justifyContent=space_between}
            text "k" {fill=$ink-2 fontFamily=$font-body fontSize=13 fontWeight=normal}  ← "Response time"
            text "v" {width=300 fill=$ink fontFamily=$font-data fontSize=13 fontWeight=normal textGrowth=fixed-width}  ← "< 5 s"
          frame "Detection range" {width=fill_container stroke=$border-subtle strokeWidth={"bottom":1} gap=24 padding=[10,0] justifyContent=space_between}
            text "k" {fill=$ink-2 fontFamily=$font-body fontSize=13 fontWeight=normal}  ← "Detection range"
            text "v" {width=300 fill=$ink fontFamily=$font-data fontSize=13 fontWeight=normal textGrowth=fixed-width}  ← "up to 65 m"
      frame "Col R" {width=fill_container layout=vertical gap=28}
        frame "ELECTRICAL & SIGNAL" {width=fill_container layout=vertical}
          frame "gh" {width=fill_container padding=[0,0,12,0]}
            text "gt" {fill=$muted fontFamily=$font-mono fontSize=11 fontWeight=normal letterSpacing=1.5}  ← "ELECTRICAL & SIGNAL"
          frame "Supply voltage" {width=fill_container stroke=$border-subtle strokeWidth={"bottom":1} gap=24 padding=[10,0] justifyContent=space_between}
            text "k" {fill=$ink-2 fontFamily=$font-body fontSize=13 fontWeight=normal}  ← "Supply voltage"
            text "v" {width=300 fill=$ink fontFamily=$font-data fontSize=13 fontWeight=normal textGrowth=fixed-width}  ← "18 – 32 V DC"
          frame "Power draw" {width=fill_container stroke=$border-subtle strokeWidth={"bottom":1} gap=24 padding=[10,0] justifyContent=space_between}
            text "k" {fill=$ink-2 fontFamily=$font-body fontSize=13 fontWeight=normal}  ← "Power draw"
            text "v" {width=300 fill=$ink fontFamily=$font-data fontSize=13 fontWeight=normal textGrowth=fixed-width}  ← "4.5 W max"
          frame "Outputs" {width=fill_container stroke=$border-subtle strokeWidth={"bottom":1} gap=24 padding=[10,0] justifyContent=space_between}
            text "k" {fill=$ink-2 fontFamily=$font-body fontSize=13 fontWeight=normal}  ← "Outputs"
            text "v" {width=300 fill=$ink fontFamily=$font-data fontSize=13 fontWeight=normal textGrowth=fixed-width}  ← "4–20 mA · Relay · Modbus · HART"
          frame "Alarm relay" {width=fill_container stroke=$border-subtle strokeWidth={"bottom":1} gap=24 padding=[10,0] justifyContent=space_between}
            text "k" {fill=$ink-2 fontFamily=$font-body fontSize=13 fontWeight=normal}  ← "Alarm relay"
            text "v" {width=300 fill=$ink fontFamily=$font-data fontSize=13 fontWeight=normal textGrowth=fixed-width}  ← "SPDT, 2 A @ 30 V DC"
          frame "Cable entry" {width=fill_container stroke=$border-subtle strokeWidth={"bottom":1} gap=24 padding=[10,0] justifyContent=space_between}
            text "k" {fill=$ink-2 fontFamily=$font-body fontSize=13 fontWeight=normal}  ← "Cable entry"
            text "v" {width=300 fill=$ink fontFamily=$font-data fontSize=13 fontWeight=normal textGrowth=fixed-width}  ← "2 × M25"
        frame "ENVIRONMENTAL" {width=fill_container layout=vertical}
          frame "gh" {width=fill_container padding=[0,0,12,0]}
            text "gt" {fill=$muted fontFamily=$font-mono fontSize=11 fontWeight=normal letterSpacing=1.5}  ← "ENVIRONMENTAL"
          frame "Operating temp" {width=fill_container stroke=$border-subtle strokeWidth={"bottom":1} gap=24 padding=[10,0] justifyContent=space_between}
            text "k" {fill=$ink-2 fontFamily=$font-body fontSize=13 fontWeight=normal}  ← "Operating temp"
            text "v" {width=300 fill=$ink fontFamily=$font-data fontSize=13 fontWeight=normal textGrowth=fixed-width}  ← "−55 … +85 °C"
          frame "Humidity" {width=fill_container stroke=$border-subtle strokeWidth={"bottom":1} gap=24 padding=[10,0] justifyContent=space_between}
            text "k" {fill=$ink-2 fontFamily=$font-body fontSize=13 fontWeight=normal}  ← "Humidity"
            text "v" {width=300 fill=$ink fontFamily=$font-data fontSize=13 fontWeight=normal textGrowth=fixed-width}  ← "0–99 % RH non-cond."
          frame "Enclosure rating" {width=fill_container stroke=$border-subtle strokeWidth={"bottom":1} gap=24 padding=[10,0] justifyContent=space_between}
            text "k" {fill=$ink-2 fontFamily=$font-body fontSize=13 fontWeight=normal}  ← "Enclosure rating"
            text "v" {width=300 fill=$ink fontFamily=$font-data fontSize=13 fontWeight=normal textGrowth=fixed-width}  ← "IP66 / IP67"
          frame "Vibration" {width=fill_container stroke=$border-subtle strokeWidth={"bottom":1} gap=24 padding=[10,0] justifyContent=space_between}
            text "k" {fill=$ink-2 fontFamily=$font-body fontSize=13 fontWeight=normal}  ← "Vibration"
            text "v" {width=300 fill=$ink fontFamily=$font-data fontSize=13 fontWeight=normal textGrowth=fixed-width}  ← "EN 60068-2-6"
        frame "COMPLIANCE & APPROVALS" {width=fill_container layout=vertical}
          frame "gh" {width=fill_container padding=[0,0,12,0]}
            text "gt" {fill=$muted fontFamily=$font-mono fontSize=11 fontWeight=normal letterSpacing=1.5}  ← "COMPLIANCE & APPROVALS"
          frame "Fire approval" {width=fill_container stroke=$border-subtle strokeWidth={"bottom":1} gap=24 padding=[10,0] justifyContent=space_between}
            text "k" {fill=$ink-2 fontFamily=$font-body fontSize=13 fontWeight=normal}  ← "Fire approval"
            text "v" {width=300 fill=$ink fontFamily=$font-data fontSize=13 fontWeight=normal textGrowth=fixed-width}  ← "EN 54-10 · FM 3260"
          frame "Hazardous area" {width=fill_container stroke=$border-subtle strokeWidth={"bottom":1} gap=24 padding=[10,0] justifyContent=space_between}
            text "k" {fill=$ink-2 fontFamily=$font-body fontSize=13 fontWeight=normal}  ← "Hazardous area"
            text "v" {width=300 fill=$ink fontFamily=$font-data fontSize=13 fontWeight=normal textGrowth=fixed-width}  ← "ATEX / IECEx Zone 1"
          frame "Marine" {width=fill_container stroke=$border-subtle strokeWidth={"bottom":1} gap=24 padding=[10,0] justifyContent=space_between}
            text "k" {fill=$ink-2 fontFamily=$font-body fontSize=13 fontWeight=normal}  ← "Marine"
            text "v" {width=300 fill=$ink fontFamily=$font-data fontSize=13 fontWeight=normal textGrowth=fixed-width}  ← "DNV type approved"
          frame "Functional safety" {width=fill_container stroke=$border-subtle strokeWidth={"bottom":1} gap=24 padding=[10,0] justifyContent=space_between}
            text "k" {fill=$ink-2 fontFamily=$font-body fontSize=13 fontWeight=normal}  ← "Functional safety"
            text "v" {width=300 fill=$ink fontFamily=$font-data fontSize=13 fontWeight=normal textGrowth=fixed-width}  ← "SIL 2 (IEC 61508)"
  frame "Section" {width=fill_container fill=$surface stroke=$border-subtle strokeWidth={"top":1} layout=vertical gap=24 padding=[44,100]}
    frame "Head" {width=fill_container layout=vertical gap=8}
      text "kick" {fill=$accent-soft fontFamily=$font-mono fontSize=11 fontWeight=normal letterSpacing=1.5}  ← "02 — DOCUMENTS & DOWNLOADS"
      text "h2" {fill=$ink fontFamily=$font-heading fontSize=24 fontWeight=700 letterSpacing=-0.4}  ← "Documentation"
      text "sub" {width=720 fill=$ink-2 fontFamily=$font-body fontSize=14 fontWeight=normal lineHeight=1.5 textGrowth=fixed-width}  ← "Free to download — no login, no lead form. Datasheets and certificates stay at a stable UR"
    frame "Doc List" {width=fill_container stroke=$border-subtle strokeWidth={"top":1} layout=vertical}
      frame "Product datasheet — FD-9500" {width=fill_container stroke=$border-subtle strokeWidth={"bottom":1} gap=16 padding=[16,4] alignItems=center}
        frame "lft" {width=fill_container gap=14 alignItems=center}
          frame "ib" {width=40 height=40 fill=$surface-2 stroke=$border-subtle strokeWidth=1 layout=vertical justifyContent=center alignItems=center}
            icon "ic" {width=19 height=19 fill=$ink-2 icon=file-text}
          frame "tx" {layout=vertical gap=3}
            text "nm" {fill=$ink fontFamily=$font-body fontSize=15 fontWeight=600}  ← "Product datasheet — FD-9500"
            text "meta" {fill=$muted fontFamily=$font-mono fontSize=11 fontWeight=normal letterSpacing=0.3}  ← "PDF · 1.8 MB · EN / TR / RU"
        frame "badge" {fill=$surface-2 stroke=$border-subtle strokeWidth=1 padding=[4,8]}
          text "t" {fill=$ink-2 fontFamily=$font-mono fontSize=10 fontWeight=normal letterSpacing=1}  ← "PDF"
        frame "dl" {fill=$surface stroke=$ink strokeWidth=1 gap=7 padding=[9,16] alignItems=center}
          icon "i" {width=15 height=15 fill=$ink icon=download}
          text "l" {fill=$ink fontFamily=$font-body fontSize=13 fontWeight=600}  ← "Download"
      frame "EN 54-10 Declaration of Performance" {width=fill_container stroke=$border-subtle strokeWidth={"bottom":1} gap=16 padding=[16,4] alignItems=center}
        frame "lft" {width=fill_container gap=14 alignItems=center}
          frame "ib" {width=40 height=40 fill=$surface-2 stroke=$border-subtle strokeWidth=1 layout=vertical justifyContent=center alignItems=center}
            icon "ic" {width=19 height=19 fill=$ink-2 icon=award}
          frame "tx" {layout=vertical gap=3}
            text "nm" {fill=$ink fontFamily=$font-body fontSize=15 fontWeight=600}  ← "EN 54-10 Declaration of Performance"
            text "meta" {fill=$muted fontFamily=$font-mono fontSize=11 fontWeight=normal letterSpacing=0.3}  ← "PDF · 640 KB"
        frame "badge" {fill=$surface-2 stroke=$border-subtle strokeWidth=1 padding=[4,8]}
          text "t" {fill=$ink-2 fontFamily=$font-mono fontSize=10 fontWeight=normal letterSpacing=1}  ← "PDF"
        frame "dl" {fill=$surface stroke=$ink strokeWidth=1 gap=7 padding=[9,16] alignItems=center}
          icon "i" {width=15 height=15 fill=$ink icon=download}
          text "l" {fill=$ink fontFamily=$font-body fontSize=13 fontWeight=600}  ← "Download"
      frame "ATEX / IECEx certificate" {width=fill_container stroke=$border-subtle strokeWidth={"bottom":1} gap=16 padding=[16,4] alignItems=center}
        frame "lft" {width=fill_container gap=14 alignItems=center}
          frame "ib" {width=40 height=40 fill=$surface-2 stroke=$border-subtle strokeWidth=1 layout=vertical justifyContent=center alignItems=center}
            icon "ic" {width=19 height=19 fill=$ink-2 icon=shield-check}
          frame "tx" {layout=vertical gap=3}
            text "nm" {fill=$ink fontFamily=$font-body fontSize=15 fontWeight=600}  ← "ATEX / IECEx certificate"
            text "meta" {fill=$muted fontFamily=$font-mono fontSize=11 fontWeight=normal letterSpacing=0.3}  ← "PDF · 720 KB"
        frame "badge" {fill=$surface-2 stroke=$border-subtle strokeWidth=1 padding=[4,8]}
          text "t" {fill=$ink-2 fontFamily=$font-mono fontSize=10 fontWeight=normal letterSpacing=1}  ← "PDF"
        frame "dl" {fill=$surface stroke=$ink strokeWidth=1 gap=7 padding=[9,16] alignItems=center}
          icon "i" {width=15 height=15 fill=$ink icon=download}
          text "l" {fill=$ink fontFamily=$font-body fontSize=13 fontWeight=600}  ← "Download"
      frame "Installation & commissioning manual" {width=fill_container stroke=$border-subtle strokeWidth={"bottom":1} gap=16 padding=[16,4] alignItems=center}
        frame "lft" {width=fill_container gap=14 alignItems=center}
          frame "ib" {width=40 height=40 fill=$surface-2 stroke=$border-subtle strokeWidth=1 layout=vertical justifyContent=center alignItems=center}
            icon "ic" {width=19 height=19 fill=$ink-2 icon=book-open}
          frame "tx" {layout=vertical gap=3}
            text "nm" {fill=$ink fontFamily=$font-body fontSize=15 fontWeight=600}  ← "Installation & commissioning manual"
            text "meta" {fill=$muted fontFamily=$font-mono fontSize=11 fontWeight=normal letterSpacing=0.3}  ← "PDF · 3.2 MB"
        frame "badge" {fill=$surface-2 stroke=$border-subtle strokeWidth=1 padding=[4,8]}
          text "t" {fill=$ink-2 fontFamily=$font-mono fontSize=10 fontWeight=normal letterSpacing=1}  ← "PDF"
        frame "dl" {fill=$surface stroke=$ink strokeWidth=1 gap=7 padding=[9,16] alignItems=center}
          icon "i" {width=15 height=15 fill=$ink icon=download}
          text "l" {fill=$ink fontFamily=$font-body fontSize=13 fontWeight=600}  ← "Download"
      frame "2D CAD drawing (dimensioned)" {width=fill_container stroke=$border-subtle strokeWidth={"bottom":1} gap=16 padding=[16,4] alignItems=center}
        frame "lft" {width=fill_container gap=14 alignItems=center}
          frame "ib" {width=40 height=40 fill=$surface-2 stroke=$border-subtle strokeWidth=1 layout=vertical justifyContent=center alignItems=center}
            icon "ic" {width=19 height=19 fill=$ink-2 icon=ruler}
          frame "tx" {layout=vertical gap=3}
            text "nm" {fill=$ink fontFamily=$font-body fontSize=15 fontWeight=600}  ← "2D CAD drawing (dimensioned)"
            text "meta" {fill=$muted fontFamily=$font-mono fontSize=11 fontWeight=normal letterSpacing=0.3}  ← "DWG · 480 KB"
        frame "badge" {fill=$surface-2 stroke=$border-subtle strokeWidth=1 padding=[4,8]}
          text "t" {fill=$ink-2 fontFamily=$font-mono fontSize=10 fontWeight=normal letterSpacing=1}  ← "DWG"
        frame "dl" {fill=$surface stroke=$ink strokeWidth=1 gap=7 padding=[9,16] alignItems=center}
          icon "i" {width=15 height=15 fill=$ink icon=download}
          text "l" {fill=$ink fontFamily=$font-body fontSize=13 fontWeight=600}  ← "Download"
  frame "Section" {width=fill_container fill=$surface stroke=$border-subtle strokeWidth={"top":1} layout=vertical gap=24 padding=[44,100]}
    frame "Head" {width=fill_container layout=vertical gap=8}
      text "kick" {fill=$accent-soft fontFamily=$font-mono fontSize=11 fontWeight=normal letterSpacing=1.5}  ← "03 — CROSS-REFERENCES & EQUIVALENTS"
      text "h2" {fill=$ink fontFamily=$font-heading fontSize=24 fontWeight=700 letterSpacing=-0.4}  ← "Find it by another model number"
      text "sub" {width=720 fill=$ink-2 fontFamily=$font-body fontSize=14 fontWeight=normal lineHeight=1.5 textGrowth=fixed-width}  ← "Searching for a competitor part? Match its model number to the GLH-catalog equivalent. Cov"
    frame "Xref Table" {width=fill_container stroke=$border-subtle strokeWidth=1 layout=vertical}
      frame "hrow" {width=fill_container fill=$surface-2 stroke=$border-subtle strokeWidth={"bottom":1} padding=[0,20] alignItems=center}
        frame "h_EXTERNAL MODEL" {width=380 padding=[12,0]}
          text "t" {fill=$muted fontFamily=$font-mono fontSize=11 fontWeight=normal letterSpacing=1}  ← "EXTERNAL MODEL"
        frame "h_BRAND" {width=200 padding=[12,0]}
          text "t" {fill=$muted fontFamily=$font-mono fontSize=11 fontWeight=normal letterSpacing=1}  ← "BRAND"
        frame "h_GLH EQUIVALENT" {width=380 padding=[12,0]}
          text "t" {fill=$muted fontFamily=$font-mono fontSize=11 fontWeight=normal letterSpacing=1}  ← "GLH EQUIVALENT"
        frame "h_MATCH" {width=fill_container padding=[12,0]}
          text "t" {fill=$muted fontFamily=$font-mono fontSize=11 fontWeight=normal letterSpacing=1}  ← "MATCH"
      frame "r0" {width=fill_container fill=$surface stroke=$border-subtle strokeWidth={"bottom":1} padding=[0,20] alignItems=center}
        frame "c1" {width=380 padding=[14,0]}
          text "t" {fill=$ink fontFamily=$font-data fontSize=14 fontWeight=normal}  ← "X3-3301"
        frame "c2" {width=200 padding=[14,0]}
          text "t" {fill=$ink-2 fontFamily=$font-body fontSize=13 fontWeight=normal}  ← "Brand A"
        frame "c3" {width=380 gap=7 padding=[14,0] alignItems=center}
          text "t" {fill=$accent fontFamily=$font-data fontSize=14 fontWeight=600}  ← "FD-9500"
          icon "a" {width=14 height=14 fill=$accent icon=arrow-up-right}
        frame "c4" {width=fill_container gap=7 padding=[14,0] alignItems=center}
          ellipse "dot" {width=8 height=8 fill=$brand}
          text "t" {fill=$ink-2 fontFamily=$font-body fontSize=13 fontWeight=normal}  ← "Direct"
      frame "r1" {width=fill_container fill=$surface stroke=$border-subtle strokeWidth={"bottom":1} padding=[0,20] alignItems=center}
        frame "c1" {width=380 padding=[14,0]}
          text "t" {fill=$ink fontFamily=$font-data fontSize=14 fontWeight=normal}  ← "SS-4 IR³"
        frame "c2" {width=200 padding=[14,0]}
          text "t" {fill=$ink-2 fontFamily=$font-body fontSize=13 fontWeight=normal}  ← "Brand B"
        frame "c3" {width=380 gap=7 padding=[14,0] alignItems=center}
          text "t" {fill=$accent fontFamily=$font-data fontSize=14 fontWeight=600}  ← "FD-9500"
          icon "a" {width=14 height=14 fill=$accent icon=arrow-up-right}
        frame "c4" {width=fill_container gap=7 padding=[14,0] alignItems=center}
          ellipse "dot" {width=8 height=8 fill=$brand}
          text "t" {fill=$ink-2 fontFamily=$font-body fontSize=13 fontWeight=normal}  ← "Direct"
      frame "r2" {width=fill_container fill=$surface stroke=$border-subtle strokeWidth={"bottom":1} padding=[0,20] alignItems=center}
        frame "c1" {width=380 padding=[14,0]}
          text "t" {fill=$ink fontFamily=$font-data fontSize=14 fontWeight=normal}  ← "FL-4000H"
        frame "c2" {width=200 padding=[14,0]}
          text "t" {fill=$ink-2 fontFamily=$font-body fontSize=13 fontWeight=normal}  ← "Brand C"
        frame "c3" {width=380 gap=7 padding=[14,0] alignItems=center}
          text "t" {fill=$accent fontFamily=$font-data fontSize=14 fontWeight=600}  ← "FD-9500-H (HART)"
          icon "a" {width=14 height=14 fill=$accent icon=arrow-up-right}
        frame "c4" {width=fill_container gap=7 padding=[14,0] alignItems=center}
          ellipse "dot" {width=8 height=8 fill=$accent}
          text "t" {fill=$ink-2 fontFamily=$font-body fontSize=13 fontWeight=normal}  ← "Variant"
      frame "r3" {width=fill_container fill=$surface stroke=$border-subtle padding=[0,20] alignItems=center}
        frame "c1" {width=380 padding=[14,0]}
          text "t" {fill=$ink fontFamily=$font-data fontSize=14 fontWeight=normal}  ← "FS-20X dual"
        frame "c2" {width=200 padding=[14,0]}
          text "t" {fill=$ink-2 fontFamily=$font-body fontSize=13 fontWeight=normal}  ← "Brand D"
        frame "c3" {width=380 gap=7 padding=[14,0] alignItems=center}
          text "t" {fill=$accent fontFamily=$font-data fontSize=14 fontWeight=600}  ← "FD-9300 (dual-IR)"
          icon "a" {width=14 height=14 fill=$accent icon=arrow-up-right}
        frame "c4" {width=fill_container gap=7 padding=[14,0] alignItems=center}
          ellipse "dot" {width=8 height=8 fill=$muted}
          text "t" {fill=$ink-2 fontFamily=$font-body fontSize=13 fontWeight=normal}  ← "Alternative"
  frame "Section Accessories" {width=fill_container fill=$surface stroke=$border-subtle strokeWidth={"top":1} layout=vertical gap=24 padding=[44,100]}
    frame "Head" {width=fill_container layout=vertical gap=8}
      text "kick" {fill=$accent-soft fontFamily=$font-mono fontSize=11 fontWeight=normal letterSpacing=1.5}  ← "04 — COMPATIBLE ACCESSORIES"
      text "h2" {fill=$ink fontFamily=$font-heading fontSize=24 fontWeight=700 letterSpacing=-0.4}  ← "Engineered to fit"
    frame "Acc Row" {width=fill_container gap=20}
      ref "Weather cover — WC-95" {width=fill_container}
      ref "Air shield / purge kit" {width=fill_container}
      ref "Swivel mount bracket" {width=fill_container}
      ref "Test lamp — FD-TL2" {width=fill_container}
  frame "Section Projects" {width=fill_container fill=$surface stroke=$border-subtle strokeWidth={"top":1} layout=vertical gap=24 padding=[44,100]}
    frame "Head" {width=fill_container layout=vertical gap=8}
      text "kick" {fill=$accent-soft fontFamily=$font-mono fontSize=11 fontWeight=normal letterSpacing=1.5}  ← "05 — USED IN PROJECTS"
      text "h2" {fill=$ink fontFamily=$font-heading fontSize=24 fontWeight=700 letterSpacing=-0.4}  ← "Deployed in the field"
    frame "Proj Row" {width=fill_container gap=20}
      frame "LNG terminal fire & gas upgrade" {width=fill_container fill=$surface stroke=$border-subtle strokeWidth=1 layout=vertical}
        frame "band" {width=fill_container height=132 fill=$surface-2 stroke=$border-subtle strokeWidth={"bottom":1} layout=vertical justifyContent=center alignItems=center}
          icon "ic" {width=40 height=40 fill=$ink-2 icon=factory}
        frame "body" {width=fill_container layout=vertical gap=10 padding=18}
          frame "tag" {fill=$surface-2 stroke=$border-subtle strokeWidth=1 padding=[4,9]}
            text "t" {fill=$ink-2 fontFamily=$font-mono fontSize=10 fontWeight=normal letterSpacing=1}  ← "ENERGY"
          text "title" {width=fill_container fill=$ink fontFamily=$font-heading fontSize=17 fontWeight=600 lineHeight=1.25 textGrowth=fixed-width}  ← "LNG terminal fire & gas upgrade"
          text "meta" {fill=$muted fontFamily=$font-data fontSize=12 fontWeight=normal}  ← "142 units · Türkiye"
          frame "view" {gap=6 alignItems=center}
            text "t" {fill=$accent fontFamily=$font-body fontSize=13 fontWeight=600}  ← "View project"
            icon "a" {width=14 height=14 fill=$accent icon=arrow-right}
      frame "Automated warehouse detection" {width=fill_container fill=$surface stroke=$border-subtle strokeWidth=1 layout=vertical}
        frame "band" {width=fill_container height=132 fill=$surface-2 stroke=$border-subtle strokeWidth={"bottom":1} layout=vertical justifyContent=center alignItems=center}
          icon "ic" {width=40 height=40 fill=$ink-2 icon=package}
        frame "body" {width=fill_container layout=vertical gap=10 padding=18}
          frame "tag" {fill=$surface-2 stroke=$border-subtle strokeWidth=1 padding=[4,9]}
            text "t" {fill=$ink-2 fontFamily=$font-mono fontSize=10 fontWeight=normal letterSpacing=1}  ← "LOGISTICS"
          text "title" {width=fill_container fill=$ink fontFamily=$font-heading fontSize=17 fontWeight=600 lineHeight=1.25 textGrowth=fixed-width}  ← "Automated warehouse detection"
          text "meta" {fill=$muted fontFamily=$font-data fontSize=12 fontWeight=normal}  ← "60 units · Georgia"
          frame "view" {gap=6 alignItems=center}
            text "t" {fill=$accent fontFamily=$font-body fontSize=13 fontWeight=600}  ← "View project"
            icon "a" {width=14 height=14 fill=$accent icon=arrow-right}
      frame "Tank-farm flame coverage" {width=fill_container fill=$surface stroke=$border-subtle strokeWidth=1 layout=vertical}
        frame "band" {width=fill_container height=132 fill=$surface-2 stroke=$border-subtle strokeWidth={"bottom":1} layout=vertical justifyContent=center alignItems=center}
          icon "ic" {width=40 height=40 fill=$ink-2 icon=fuel}
        frame "body" {width=fill_container layout=vertical gap=10 padding=18}
          frame "tag" {fill=$surface-2 stroke=$border-subtle strokeWidth=1 padding=[4,9]}
            text "t" {fill=$ink-2 fontFamily=$font-mono fontSize=10 fontWeight=normal letterSpacing=1}  ← "PETROCHEMICAL"
          text "title" {width=fill_container fill=$ink fontFamily=$font-heading fontSize=17 fontWeight=600 lineHeight=1.25 textGrowth=fixed-width}  ← "Tank-farm flame coverage"
          text "meta" {fill=$muted fontFamily=$font-data fontSize=12 fontWeight=normal}  ← "88 units · Azerbaijan"
          frame "view" {gap=6 alignItems=center}
            text "t" {fill=$accent fontFamily=$font-body fontSize=13 fontWeight=600}  ← "View project"
            icon "a" {width=14 height=14 fill=$accent icon=arrow-right}
  frame "CTA Band" {width=fill_container fill=$ink gap=40 padding=[56,100] alignItems=center}
    frame "Left" {width=fill_container layout=vertical gap=10}
      text "kick" {fill=$accent-soft fontFamily=$font-mono fontSize=11 fontWeight=normal letterSpacing=1.5}  ← "SPECCING THIS INTO A PROJECT?"
      text "h" {width=fill_container fill=#FFFFFF fontFamily=$font-heading fontSize=30 fontWeight=700 letterSpacing=-0.5 textGrowth=fixed-width}  ← "Get FD-9500 quoted for your exact scope"
      text "s" {width=fill_container fill=$muted fontFamily=$font-body fontSize=14 fontWeight=normal lineHeight=1.5 textGrowth=fixed-width}  ← "Technical review in 24 h · specced proposal in 3 working days. Quantities, variants and co"
    frame "Right" {width=320 layout=vertical gap=12}
      frame "Primary" {width=fill_container fill=$surface gap=8 padding=[14,24] justifyContent=center alignItems=center}
        text "l" {fill=$ink fontFamily=$font-body fontSize=15 fontWeight=600}  ← "Request a quote for this product"
      frame "Secondary" {width=fill_container fill=$ink stroke=#FFFFFF strokeWidth=1 gap=8 padding=[13,24] justifyContent=center alignItems=center}
        icon "i" {width=15 height=15 fill=#FFFFFF icon=phone}
        text "l" {fill=#FFFFFF fontFamily=$font-body fontSize=14 fontWeight=600}  ← "Talk to an engineer"
```

### Industry — Desktop  `#pkiw0`

```
frame "Industry — Desktop" {width=1440 fill=$surface layout=vertical}
  frame "Top Nav" {width=fill_container fill=$surface stroke=$border-subtle strokeWidth={"bottom":1} padding=[20,100] justifyContent=space_between alignItems=center}
    frame "Brand" {gap=10 alignItems=center}
      frame "Mark" {width=26 height=26 fill=$brand justifyContent=center alignItems=center}
        text "MarkGlyph" {fill=#FFFFFF fontFamily=$font-heading fontSize=16 fontWeight=700}  ← "G"
      text "Wordmark" {fill=$ink fontFamily=$font-heading fontSize=16 fontWeight=700 letterSpacing=0.5}  ← "GREENLIGHTHOUSE"
    frame "Nav Links" {gap=28 alignItems=center}
      text "Industries" {fill=$ink fontFamily=$font-body fontSize=14 fontWeight=600}  ← "Industries"
      text "Products" {fill=$ink-2 fontFamily=$font-body fontSize=14 fontWeight=normal}  ← "Products"
      text "Projects" {fill=$ink-2 fontFamily=$font-body fontSize=14 fontWeight=normal}  ← "Projects"
      text "Services" {fill=$ink-2 fontFamily=$font-body fontSize=14 fontWeight=normal}  ← "Services"
      text "About" {fill=$ink-2 fontFamily=$font-body fontSize=14 fontWeight=normal}  ← "About"
    frame "Actions" {gap=16 alignItems=center}
      frame "Lang" {gap=6 alignItems=center}
        text "EN" {fill=$ink fontFamily=$font-mono fontSize=12 fontWeight=normal}  ← "EN"
        text "Sep1" {fill=$muted fontFamily=$font-mono fontSize=12 fontWeight=normal}  ← "/"
        text "TR" {fill=$muted fontFamily=$font-mono fontSize=12 fontWeight=normal}  ← "TR"
        text "Sep2" {fill=$muted fontFamily=$font-mono fontSize=12 fontWeight=normal}  ← "/"
        text "RU" {fill=$muted fontFamily=$font-mono fontSize=12 fontWeight=normal}  ← "RU"
      text "Phone" {fill=$ink fontFamily=$font-mono fontSize=13 fontWeight=normal}  ← "+90 212 000 00 00"
      frame "Nav CTA" {fill=$accent padding=[10,18] alignItems=center}
        text "CTA Label" {fill=#FFFFFF fontFamily=$font-body fontSize=14 fontWeight=600}  ← "Request Project Quote"
  frame "Breadcrumb" {width=fill_container fill=$surface-2 stroke=$border-subtle strokeWidth={"bottom":1} gap=8 padding=[14,100] alignItems=center}
    text "Industries" {fill=$muted fontFamily=$font-mono fontSize=12 fontWeight=normal}  ← "Industries"
    text "sep0" {fill=$border-subtle fontFamily=$font-mono fontSize=12 fontWeight=normal}  ← "/"
    text "Oil & Gas" {fill=$ink fontFamily=$font-mono fontSize=12 fontWeight=normal}  ← "Oil & Gas"
  frame "Industry Hero" {width=fill_container fill=$ink gap=56 padding=[64,100]}
    frame "Hero Left" {width=fill_container layout=vertical gap=26}
      text "kick" {fill=$accent-soft fontFamily=$font-mono fontSize=11 fontWeight=normal letterSpacing=2}  ← "INDUSTRY · OIL & GAS"
      text "H1" {width=fill_container fill=#FFFFFF fontFamily=$font-heading fontSize=46 fontWeight=700 lineHeight=1.08 letterSpacing=-1 textGrowth=fixed-width}  ← "Fire, gas & safety supply for oil & gas"
      text "lead" {width=fill_container fill=#C2C9D2 fontFamily=$font-body fontSize=16 fontWeight=normal lineHeight=1.55 textGrowth=fixed-width}  ← "From flame and gas detection to fixed suppression and personal protection — specced, certi"
      frame "Stats" {width=fill_container gap=48 padding=[8,0,0,0]}
        frame "PROJECTS DELIVERED" {layout=vertical gap=5}
          text "n" {fill=#FFFFFF fontFamily=$font-mono fontSize=27 fontWeight=normal}  ← "40+"
          text "l" {fill=$muted fontFamily=$font-mono fontSize=11 fontWeight=normal letterSpacing=1}  ← "PROJECTS DELIVERED"
        frame "EQUIPMENT CATEGORIES" {layout=vertical gap=5}
          text "n" {fill=#FFFFFF fontFamily=$font-mono fontSize=27 fontWeight=normal}  ← "6"
          text "l" {fill=$muted fontFamily=$font-mono fontSize=11 fontWeight=normal letterSpacing=1}  ← "EQUIPMENT CATEGORIES"
        frame "IECEx CERTIFIED" {layout=vertical gap=5}
          text "n" {fill=#FFFFFF fontFamily=$font-mono fontSize=27 fontWeight=normal}  ← "ATEX"
          text "l" {fill=$muted fontFamily=$font-mono fontSize=11 fontWeight=normal letterSpacing=1}  ← "IECEx CERTIFIED"
        frame "RFQ REVIEW" {layout=vertical gap=5}
          text "n" {fill=#FFFFFF fontFamily=$font-mono fontSize=27 fontWeight=normal}  ← "24 h"
          text "l" {fill=$muted fontFamily=$font-mono fontSize=11 fontWeight=normal letterSpacing=1}  ← "RFQ REVIEW"
      frame "CTAs" {width=fill_container gap=12 padding=[10,0,0,0]}
        frame "Primary" {fill=$surface padding=[13,22] justifyContent=center alignItems=center}
          text "l" {fill=$ink fontFamily=$font-body fontSize=15 fontWeight=600}  ← "Discuss an oil & gas project"
        frame "Secondary" {fill=$ink stroke=#C2C9D2 strokeWidth=1 gap=8 padding=[12,22] justifyContent=center alignItems=center}
          text "l" {fill=#FFFFFF fontFamily=$font-body fontSize=14 fontWeight=600}  ← "Browse the catalog"
          icon "a" {width=15 height=15 fill=#FFFFFF icon=arrow-right}
    frame "Applications" {width=420 fill=#1B222E stroke=#2A3340 strokeWidth=1 layout=vertical}
      frame "ph" {width=fill_container stroke=#2A3340 strokeWidth={"bottom":1} padding=[16,20]}
        text "t" {fill=$accent-soft fontFamily=$font-mono fontSize=11 fontWeight=normal letterSpacing=1.5}  ← "TYPICAL APPLICATIONS"
      frame "Offshore platforms" {width=fill_container stroke=#2A3340 strokeWidth={"bottom":1} gap=14 padding=[15,20] alignItems=center}
        icon "ic" {width=19 height=19 fill=$accent-soft icon=waves}
        text "t" {width=fill_container fill=#FFFFFF fontFamily=$font-body fontSize=15 fontWeight=normal textGrowth=fixed-width}  ← "Offshore platforms"
      frame "Refineries & petrochemical" {width=fill_container stroke=#2A3340 strokeWidth={"bottom":1} gap=14 padding=[15,20] alignItems=center}
        icon "ic" {width=19 height=19 fill=$accent-soft icon=factory}
        text "t" {width=fill_container fill=#FFFFFF fontFamily=$font-body fontSize=15 fontWeight=normal textGrowth=fixed-width}  ← "Refineries & petrochemical"
      frame "Tank farms & terminals" {width=fill_container stroke=#2A3340 strokeWidth={"bottom":1} gap=14 padding=[15,20] alignItems=center}
        icon "ic" {width=19 height=19 fill=$accent-soft icon=fuel}
        text "t" {width=fill_container fill=#FFFFFF fontFamily=$font-body fontSize=15 fontWeight=normal textGrowth=fixed-width}  ← "Tank farms & terminals"
      frame "LNG / gas processing" {width=fill_container stroke=#2A3340 strokeWidth={"bottom":1} gap=14 padding=[15,20] alignItems=center}
        icon "ic" {width=19 height=19 fill=$accent-soft icon=flame}
        text "t" {width=fill_container fill=#FFFFFF fontFamily=$font-body fontSize=15 fontWeight=normal textGrowth=fixed-width}  ← "LNG / gas processing"
      frame "Pipelines & pump stations" {width=fill_container stroke=#2A3340 gap=14 padding=[15,20] alignItems=center}
        icon "ic" {width=19 height=19 fill=$accent-soft icon=git-commit-horizontal}
        text "t" {width=fill_container fill=#FFFFFF fontFamily=$font-body fontSize=15 fontWeight=normal textGrowth=fixed-width}  ← "Pipelines & pump stations"
  frame "Section Supply" {width=fill_container fill=$surface layout=vertical gap=28 padding=[56,100]}
    frame "Head" {width=fill_container gap=20 justifyContent=space_between alignItems=end}
      frame "HL" {layout=vertical gap=7}
        text "kick" {fill=$accent-soft fontFamily=$font-mono fontSize=11 fontWeight=normal letterSpacing=1.5}  ← "WHAT WE SUPPLY"
        text "h2" {fill=$ink fontFamily=$font-heading fontSize=28 fontWeight=700 letterSpacing=-0.5}  ← "Equipment for oil & gas"
      frame "HR" {gap=7 alignItems=center}
        text "t" {fill=$accent fontFamily=$font-body fontSize=14 fontWeight=600}  ← "See all 237 products"
        icon "a" {width=15 height=15 fill=$accent icon=arrow-right}
    frame "Cat Grid" {width=fill_container layout=vertical gap=20}
      frame "row0" {width=fill_container gap=20}
        frame "Fire & gas detection" {width=fill_container fill=$surface stroke=$border-subtle strokeWidth=1 layout=vertical gap=14 padding=22}
          frame "ib" {width=46 height=46 fill=$surface-2 stroke=$border-subtle strokeWidth=1 layout=vertical justifyContent=center alignItems=center}
            icon "ic" {width=23 height=23 fill=$accent icon=flame}
          text "t" {width=fill_container fill=$ink fontFamily=$font-heading fontSize=17 fontWeight=600 lineHeight=1.2 textGrowth=fixed-width}  ← "Fire & gas detection"
          text "d" {width=fill_container fill=$ink-2 fontFamily=$font-body fontSize=13 fontWeight=normal lineHeight=1.5 textGrowth=fixed-width}  ← "Flame, smoke and gas detectors for early hazard warning in classified areas."
          frame "foot" {width=fill_container stroke=$border-subtle strokeWidth={"top":1} padding=[12,0,0,0] justifyContent=space_between alignItems=center}
            text "cnt" {fill=$muted fontFamily=$font-mono fontSize=11 fontWeight=normal letterSpacing=0.5}  ← "42 products"
            frame "br" {gap=6 alignItems=center}
              text "t" {fill=$accent fontFamily=$font-body fontSize=13 fontWeight=600}  ← "Browse"
              icon "a" {width=14 height=14 fill=$accent icon=arrow-right}
        frame "Fixed fire suppression" {width=fill_container fill=$surface stroke=$border-subtle strokeWidth=1 layout=vertical gap=14 padding=22}
          frame "ib" {width=46 height=46 fill=$surface-2 stroke=$border-subtle strokeWidth=1 layout=vertical justifyContent=center alignItems=center}
            icon "ic" {width=23 height=23 fill=$accent icon=droplets}
          text "t" {width=fill_container fill=$ink fontFamily=$font-heading fontSize=17 fontWeight=600 lineHeight=1.2 textGrowth=fixed-width}  ← "Fixed fire suppression"
          text "d" {width=fill_container fill=$ink-2 fontFamily=$font-body fontSize=13 fontWeight=normal lineHeight=1.5 textGrowth=fixed-width}  ← "CO₂, foam, water-mist and clean-agent systems, engineered per zone."
          frame "foot" {width=fill_container stroke=$border-subtle strokeWidth={"top":1} padding=[12,0,0,0] justifyContent=space_between alignItems=center}
            text "cnt" {fill=$muted fontFamily=$font-mono fontSize=11 fontWeight=normal letterSpacing=0.5}  ← "28 products"
            frame "br" {gap=6 alignItems=center}
              text "t" {fill=$accent fontFamily=$font-body fontSize=13 fontWeight=600}  ← "Browse"
              icon "a" {width=14 height=14 fill=$accent icon=arrow-right}
        frame "Explosion-proof equipment" {width=fill_container fill=$surface stroke=$border-subtle strokeWidth=1 layout=vertical gap=14 padding=22}
          frame "ib" {width=46 height=46 fill=$surface-2 stroke=$border-subtle strokeWidth=1 layout=vertical justifyContent=center alignItems=center}
            icon "ic" {width=23 height=23 fill=$accent icon=shield}
          text "t" {width=fill_container fill=$ink fontFamily=$font-heading fontSize=17 fontWeight=600 lineHeight=1.2 textGrowth=fixed-width}  ← "Explosion-proof equipment"
          text "d" {width=fill_container fill=$ink-2 fontFamily=$font-body fontSize=13 fontWeight=normal lineHeight=1.5 textGrowth=fixed-width}  ← "Ex d / Ex e luminaires, junction boxes, alarms and controls."
          frame "foot" {width=fill_container stroke=$border-subtle strokeWidth={"top":1} padding=[12,0,0,0] justifyContent=space_between alignItems=center}
            text "cnt" {fill=$muted fontFamily=$font-mono fontSize=11 fontWeight=normal letterSpacing=0.5}  ← "63 products"
            frame "br" {gap=6 alignItems=center}
              text "t" {fill=$accent fontFamily=$font-body fontSize=13 fontWeight=600}  ← "Browse"
              icon "a" {width=14 height=14 fill=$accent icon=arrow-right}
      frame "row3" {width=fill_container gap=20}
        frame "Personal protective equipment" {width=fill_container fill=$surface stroke=$border-subtle strokeWidth=1 layout=vertical gap=14 padding=22}
          frame "ib" {width=46 height=46 fill=$surface-2 stroke=$border-subtle strokeWidth=1 layout=vertical justifyContent=center alignItems=center}
            icon "ic" {width=23 height=23 fill=$accent icon=hard-hat}
          text "t" {width=fill_container fill=$ink fontFamily=$font-heading fontSize=17 fontWeight=600 lineHeight=1.2 textGrowth=fixed-width}  ← "Personal protective equipment"
          text "d" {width=fill_container fill=$ink-2 fontFamily=$font-body fontSize=13 fontWeight=normal lineHeight=1.5 textGrowth=fixed-width}  ← "SCBA sets, flame-resistant suits, gas masks and rescue gear."
          frame "foot" {width=fill_container stroke=$border-subtle strokeWidth={"top":1} padding=[12,0,0,0] justifyContent=space_between alignItems=center}
            text "cnt" {fill=$muted fontFamily=$font-mono fontSize=11 fontWeight=normal letterSpacing=0.5}  ← "51 products"
            frame "br" {gap=6 alignItems=center}
              text "t" {fill=$accent fontFamily=$font-body fontSize=13 fontWeight=600}  ← "Browse"
              icon "a" {width=14 height=14 fill=$accent icon=arrow-right}
        frame "Gas monitoring & panels" {width=fill_container fill=$surface stroke=$border-subtle strokeWidth=1 layout=vertical gap=14 padding=22}
          frame "ib" {width=46 height=46 fill=$surface-2 stroke=$border-subtle strokeWidth=1 layout=vertical justifyContent=center alignItems=center}
            icon "ic" {width=23 height=23 fill=$accent icon=gauge}
          text "t" {width=fill_container fill=$ink fontFamily=$font-heading fontSize=17 fontWeight=600 lineHeight=1.2 textGrowth=fixed-width}  ← "Gas monitoring & panels"
          text "d" {width=fill_container fill=$ink-2 fontFamily=$font-body fontSize=13 fontWeight=normal lineHeight=1.5 textGrowth=fixed-width}  ← "Fixed and portable gas monitors with addressable control panels."
          frame "foot" {width=fill_container stroke=$border-subtle strokeWidth={"top":1} padding=[12,0,0,0] justifyContent=space_between alignItems=center}
            text "cnt" {fill=$muted fontFamily=$font-mono fontSize=11 fontWeight=normal letterSpacing=0.5}  ← "34 products"
            frame "br" {gap=6 alignItems=center}
              text "t" {fill=$accent fontFamily=$font-body fontSize=13 fontWeight=600}  ← "Browse"
              icon "a" {width=14 height=14 fill=$accent icon=arrow-right}
        frame "Emergency & rescue" {width=fill_container fill=$surface stroke=$border-subtle strokeWidth=1 layout=vertical gap=14 padding=22}
          frame "ib" {width=46 height=46 fill=$surface-2 stroke=$border-subtle strokeWidth=1 layout=vertical justifyContent=center alignItems=center}
            icon "ic" {width=23 height=23 fill=$accent icon=life-buoy}
          text "t" {width=fill_container fill=$ink fontFamily=$font-heading fontSize=17 fontWeight=600 lineHeight=1.2 textGrowth=fixed-width}  ← "Emergency & rescue"
          text "d" {width=fill_container fill=$ink-2 fontFamily=$font-body fontSize=13 fontWeight=normal lineHeight=1.5 textGrowth=fixed-width}  ← "Escape sets, fire blankets, hydrants and emergency lighting."
          frame "foot" {width=fill_container stroke=$border-subtle strokeWidth={"top":1} padding=[12,0,0,0] justifyContent=space_between alignItems=center}
            text "cnt" {fill=$muted fontFamily=$font-mono fontSize=11 fontWeight=normal letterSpacing=0.5}  ← "19 products"
            frame "br" {gap=6 alignItems=center}
              text "t" {fill=$accent fontFamily=$font-body fontSize=13 fontWeight=600}  ← "Browse"
              icon "a" {width=14 height=14 fill=$accent icon=arrow-right}
  frame "Section Standards" {width=fill_container fill=$surface-2 stroke=$border-subtle strokeWidth={"top":1,"bottom":1} layout=vertical gap=24 padding=[56,100]}
    frame "Head" {width=fill_container layout=vertical gap=7}
      text "kick" {fill=$accent-soft fontFamily=$font-mono fontSize=11 fontWeight=normal letterSpacing=1.5}  ← "APPLICABLE STANDARDS"
      text "h2" {fill=$ink fontFamily=$font-heading fontSize=28 fontWeight=700 letterSpacing=-0.5}  ← "Certified for hazardous-area work"
    frame "Cert Row" {width=fill_container gap=12}
      frame "ATEX" {width=fill_container fill=$surface stroke=$border-subtle strokeWidth=1 layout=vertical gap=8 padding=16}
        frame "top" {width=fill_container gap=7 alignItems=center}
          icon "ic" {width=15 height=15 fill=$brand icon=badge-check}
          text "code" {fill=$ink fontFamily=$font-heading fontSize=15 fontWeight=700}  ← "ATEX"
        text "lbl" {width=fill_container fill=$ink-2 fontFamily=$font-body fontSize=12 fontWeight=normal lineHeight=1.4 textGrowth=fixed-width}  ← "Explosive atmospheres · EU"
      frame "IECEx" {width=fill_container fill=$surface stroke=$border-subtle strokeWidth=1 layout=vertical gap=8 padding=16}
        frame "top" {width=fill_container gap=7 alignItems=center}
          icon "ic" {width=15 height=15 fill=$brand icon=badge-check}
          text "code" {fill=$ink fontFamily=$font-heading fontSize=15 fontWeight=700}  ← "IECEx"
        text "lbl" {width=fill_container fill=$ink-2 fontFamily=$font-body fontSize=12 fontWeight=normal lineHeight=1.4 textGrowth=fixed-width}  ← "Explosive atmospheres · intl"
      frame "EN 54" {width=fill_container fill=$surface stroke=$border-subtle strokeWidth=1 layout=vertical gap=8 padding=16}
        frame "top" {width=fill_container gap=7 alignItems=center}
          icon "ic" {width=15 height=15 fill=$brand icon=badge-check}
          text "code" {fill=$ink fontFamily=$font-heading fontSize=15 fontWeight=700}  ← "EN 54"
        text "lbl" {width=fill_container fill=$ink-2 fontFamily=$font-body fontSize=12 fontWeight=normal lineHeight=1.4 textGrowth=fixed-width}  ← "Fire detection & alarm"
      frame "API 6A / 598" {width=fill_container fill=$surface stroke=$border-subtle strokeWidth=1 layout=vertical gap=8 padding=16}
        frame "top" {width=fill_container gap=7 alignItems=center}
          icon "ic" {width=15 height=15 fill=$brand icon=badge-check}
          text "code" {fill=$ink fontFamily=$font-heading fontSize=15 fontWeight=700}  ← "API 6A / 598"
        text "lbl" {width=fill_container fill=$ink-2 fontFamily=$font-body fontSize=12 fontWeight=normal lineHeight=1.4 textGrowth=fixed-width}  ← "Oil & gas valves"
      frame "ISO 9001" {width=fill_container fill=$surface stroke=$border-subtle strokeWidth=1 layout=vertical gap=8 padding=16}
        frame "top" {width=fill_container gap=7 alignItems=center}
          icon "ic" {width=15 height=15 fill=$brand icon=badge-check}
          text "code" {fill=$ink fontFamily=$font-heading fontSize=15 fontWeight=700}  ← "ISO 9001"
        text "lbl" {width=fill_container fill=$ink-2 fontFamily=$font-body fontSize=12 fontWeight=normal lineHeight=1.4 textGrowth=fixed-width}  ← "Quality management"
      frame "SIL 2" {width=fill_container fill=$surface stroke=$border-subtle strokeWidth=1 layout=vertical gap=8 padding=16}
        frame "top" {width=fill_container gap=7 alignItems=center}
          icon "ic" {width=15 height=15 fill=$brand icon=badge-check}
          text "code" {fill=$ink fontFamily=$font-heading fontSize=15 fontWeight=700}  ← "SIL 2"
        text "lbl" {width=fill_container fill=$ink-2 fontFamily=$font-body fontSize=12 fontWeight=normal lineHeight=1.4 textGrowth=fixed-width}  ← "Functional safety · 61508"
  frame "Section Services" {width=fill_container fill=$surface layout=vertical gap=28 padding=[56,100]}
    frame "Head" {width=fill_container layout=vertical gap=10}
      text "kick" {fill=$accent-soft fontFamily=$font-mono fontSize=11 fontWeight=normal letterSpacing=1.5}  ← "HOW WE DELIVER"
      text "h2" {fill=$ink fontFamily=$font-heading fontSize=28 fontWeight=700 letterSpacing=-0.5}  ← "Services for project supply"
      text "sub" {width=720 fill=$ink-2 fontFamily=$font-body fontSize=15 fontWeight=normal lineHeight=1.5 textGrowth=fixed-width}  ← "We don't just ship boxes — we spec, source, clear customs and kit to site."
    frame "Svc Row" {width=fill_container gap=20}
      frame "Technical selection" {width=fill_container fill=$surface stroke=$border-subtle strokeWidth=1 layout=vertical gap=12 padding=[24,22]}
        icon "ic" {width=26 height=26 fill=$accent icon=search-check}
        text "t" {width=fill_container fill=$ink fontFamily=$font-heading fontSize=16 fontWeight=600 lineHeight=1.25 textGrowth=fixed-width}  ← "Technical selection"
        text "d" {width=fill_container fill=$ink-2 fontFamily=$font-body fontSize=13 fontWeight=normal lineHeight=1.5 textGrowth=fixed-width}  ← "We match equipment to your zone classification, spec and standards."
      frame "Tender & procurement" {width=fill_container fill=$surface stroke=$border-subtle strokeWidth=1 layout=vertical gap=12 padding=[24,22]}
        icon "ic" {width=26 height=26 fill=$accent icon=clipboard-list}
        text "t" {width=fill_container fill=$ink fontFamily=$font-heading fontSize=16 fontWeight=600 lineHeight=1.25 textGrowth=fixed-width}  ← "Tender & procurement"
        text "d" {width=fill_container fill=$ink-2 fontFamily=$font-body fontSize=13 fontWeight=normal lineHeight=1.5 textGrowth=fixed-width}  ← "Full tender packages — BoQ, datasheets and compliance matrices."
      frame "Import / export & customs" {width=fill_container fill=$surface stroke=$border-subtle strokeWidth=1 layout=vertical gap=12 padding=[24,22]}
        icon "ic" {width=26 height=26 fill=$accent icon=ship}
        text "t" {width=fill_container fill=$ink fontFamily=$font-heading fontSize=16 fontWeight=600 lineHeight=1.25 textGrowth=fixed-width}  ← "Import / export & customs"
        text "d" {width=fill_container fill=$ink-2 fontFamily=$font-body fontSize=13 fontWeight=normal lineHeight=1.5 textGrowth=fixed-width}  ← "Cross-border logistics on the Türkiye–Russia corridor, customs handled."
      frame "Project kitting & logistics" {width=fill_container fill=$surface stroke=$border-subtle strokeWidth=1 layout=vertical gap=12 padding=[24,22]}
        icon "ic" {width=26 height=26 fill=$accent icon=package}
        text "t" {width=fill_container fill=$ink fontFamily=$font-heading fontSize=16 fontWeight=600 lineHeight=1.25 textGrowth=fixed-width}  ← "Project kitting & logistics"
        text "d" {width=fill_container fill=$ink-2 fontFamily=$font-body fontSize=13 fontWeight=normal lineHeight=1.5 textGrowth=fixed-width}  ← "Consolidated, labelled kits delivered to site on your schedule."
  frame "Section Featured" {width=fill_container fill=$surface-2 stroke=$border-subtle strokeWidth={"top":1} layout=vertical gap=28 padding=[56,100]}
    frame "Head" {width=fill_container gap=20 justifyContent=space_between alignItems=end}
      frame "HL" {layout=vertical gap=7}
        text "kick" {fill=$accent-soft fontFamily=$font-mono fontSize=11 fontWeight=normal letterSpacing=1.5}  ← "FEATURED FOR OIL & GAS"
        text "h2" {fill=$ink fontFamily=$font-heading fontSize=28 fontWeight=700 letterSpacing=-0.5}  ← "Specced for this sector"
      frame "HR" {gap=7 alignItems=center}
        text "t" {fill=$accent fontFamily=$font-body fontSize=14 fontWeight=600}  ← "All oil & gas products"
        icon "a" {width=15 height=15 fill=$accent icon=arrow-right}
    frame "Feat Row" {width=fill_container gap=20}
      ref "FD-9500 triple-IR flame detector" {width=fill_container}
      ref "GD-410 fixed gas detector" {width=fill_container}
      ref "XB-200 Ex-proof beacon" {width=fill_container}
      ref "AS-60 SCBA air set" {width=fill_container}
  frame "Section Projects" {width=fill_container fill=$surface stroke=$border-subtle strokeWidth={"top":1} layout=vertical gap=28 padding=[56,100]}
    frame "Head" {width=fill_container gap=20 justifyContent=space_between alignItems=end}
      frame "HL" {layout=vertical gap=7}
        text "kick" {fill=$accent-soft fontFamily=$font-mono fontSize=11 fontWeight=normal letterSpacing=1.5}  ← "PROVEN DELIVERY"
        text "h2" {fill=$ink fontFamily=$font-heading fontSize=28 fontWeight=700 letterSpacing=-0.5}  ← "Oil & gas projects"
      frame "HR" {gap=7 alignItems=center}
        text "t" {fill=$accent fontFamily=$font-body fontSize=14 fontWeight=600}  ← "All projects"
        icon "a" {width=15 height=15 fill=$accent icon=arrow-right}
    frame "Proj Row" {width=fill_container gap=20}
      frame "LNG terminal fire & gas upgrade" {width=fill_container fill=$surface stroke=$border-subtle strokeWidth=1 layout=vertical}
        frame "band" {width=fill_container height=140 fill=$surface-2 stroke=$border-subtle strokeWidth={"bottom":1} layout=vertical justifyContent=center alignItems=center}
          icon "ic" {width=42 height=42 fill=$ink-2 icon=flame}
        frame "body" {width=fill_container layout=vertical gap=10 padding=20}
          frame "tag" {fill=$surface-2 stroke=$border-subtle strokeWidth=1 padding=[4,9]}
            text "t" {fill=$ink-2 fontFamily=$font-mono fontSize=10 fontWeight=normal letterSpacing=1}  ← "ENERGY"
          text "title" {width=fill_container fill=$ink fontFamily=$font-heading fontSize=18 fontWeight=600 lineHeight=1.25 textGrowth=fixed-width}  ← "LNG terminal fire & gas upgrade"
          text "meta" {fill=$muted fontFamily=$font-data fontSize=12 fontWeight=normal}  ← "142 detectors · Türkiye"
          frame "view" {gap=6 padding=[8,0,0,0] alignItems=center}
            text "t" {fill=$accent fontFamily=$font-body fontSize=13 fontWeight=600}  ← "View project"
            icon "a" {width=14 height=14 fill=$accent icon=arrow-right}
      frame "Refinery gas-detection retrofit" {width=fill_container fill=$surface stroke=$border-subtle strokeWidth=1 layout=vertical}
        frame "band" {width=fill_container height=140 fill=$surface-2 stroke=$border-subtle strokeWidth={"bottom":1} layout=vertical justifyContent=center alignItems=center}
          icon "ic" {width=42 height=42 fill=$ink-2 icon=gauge}
        frame "body" {width=fill_container layout=vertical gap=10 padding=20}
          frame "tag" {fill=$surface-2 stroke=$border-subtle strokeWidth=1 padding=[4,9]}
            text "t" {fill=$ink-2 fontFamily=$font-mono fontSize=10 fontWeight=normal letterSpacing=1}  ← "OIL & GAS"
          text "title" {width=fill_container fill=$ink fontFamily=$font-heading fontSize=18 fontWeight=600 lineHeight=1.25 textGrowth=fixed-width}  ← "Refinery gas-detection retrofit"
          text "meta" {fill=$muted fontFamily=$font-data fontSize=12 fontWeight=normal}  ← "210 sensors · Russia"
          frame "view" {gap=6 padding=[8,0,0,0] alignItems=center}
            text "t" {fill=$accent fontFamily=$font-body fontSize=13 fontWeight=600}  ← "View project"
            icon "a" {width=14 height=14 fill=$accent icon=arrow-right}
      frame "Platform suppression package" {width=fill_container fill=$surface stroke=$border-subtle strokeWidth=1 layout=vertical}
        frame "band" {width=fill_container height=140 fill=$surface-2 stroke=$border-subtle strokeWidth={"bottom":1} layout=vertical justifyContent=center alignItems=center}
          icon "ic" {width=42 height=42 fill=$ink-2 icon=droplets}
        frame "body" {width=fill_container layout=vertical gap=10 padding=20}
          frame "tag" {fill=$surface-2 stroke=$border-subtle strokeWidth=1 padding=[4,9]}
            text "t" {fill=$ink-2 fontFamily=$font-mono fontSize=10 fontWeight=normal letterSpacing=1}  ← "OFFSHORE"
          text "title" {width=fill_container fill=$ink fontFamily=$font-heading fontSize=18 fontWeight=600 lineHeight=1.25 textGrowth=fixed-width}  ← "Platform suppression package"
          text "meta" {fill=$muted fontFamily=$font-data fontSize=12 fontWeight=normal}  ← "CO₂ + foam · Caspian"
          frame "view" {gap=6 padding=[8,0,0,0] alignItems=center}
            text "t" {fill=$accent fontFamily=$font-body fontSize=13 fontWeight=600}  ← "View project"
            icon "a" {width=14 height=14 fill=$accent icon=arrow-right}
```

### Project Detail — Desktop  `#A3cPs`

```
frame "Project Detail — Desktop" {width=1440 fill=$surface layout=vertical}
  frame "Top Nav" {width=fill_container fill=$surface stroke=$border-subtle strokeWidth={"bottom":1} padding=[20,100] justifyContent=space_between alignItems=center}
    frame "Brand" {gap=10 alignItems=center}
      frame "Mark" {width=26 height=26 fill=$brand justifyContent=center alignItems=center}
        text "MarkGlyph" {fill=#FFFFFF fontFamily=$font-heading fontSize=16 fontWeight=700}  ← "G"
      text "Wordmark" {fill=$ink fontFamily=$font-heading fontSize=16 fontWeight=700 letterSpacing=0.5}  ← "GREENLIGHTHOUSE"
    frame "Nav Links" {gap=28 alignItems=center}
      text "Industries" {fill=$ink-2 fontFamily=$font-body fontSize=14 fontWeight=normal}  ← "Industries"
      text "Products" {fill=$ink-2 fontFamily=$font-body fontSize=14 fontWeight=normal}  ← "Products"
      text "Projects" {fill=$ink fontFamily=$font-body fontSize=14 fontWeight=600}  ← "Projects"
      text "Services" {fill=$ink-2 fontFamily=$font-body fontSize=14 fontWeight=normal}  ← "Services"
      text "About" {fill=$ink-2 fontFamily=$font-body fontSize=14 fontWeight=normal}  ← "About"
    frame "Actions" {gap=16 alignItems=center}
      frame "Lang" {gap=6 alignItems=center}
        text "EN" {fill=$ink fontFamily=$font-mono fontSize=12 fontWeight=normal}  ← "EN"
        text "Sep1" {fill=$muted fontFamily=$font-mono fontSize=12 fontWeight=normal}  ← "/"
        text "TR" {fill=$muted fontFamily=$font-mono fontSize=12 fontWeight=normal}  ← "TR"
        text "Sep2" {fill=$muted fontFamily=$font-mono fontSize=12 fontWeight=normal}  ← "/"
        text "RU" {fill=$muted fontFamily=$font-mono fontSize=12 fontWeight=normal}  ← "RU"
      text "Phone" {fill=$ink fontFamily=$font-mono fontSize=13 fontWeight=normal}  ← "+90 212 000 00 00"
      frame "Nav CTA" {fill=$accent padding=[10,18] alignItems=center}
        text "CTA Label" {fill=#FFFFFF fontFamily=$font-body fontSize=14 fontWeight=600}  ← "Request Project Quote"
  frame "Breadcrumb" {width=fill_container fill=$surface-2 stroke=$border-subtle strokeWidth={"bottom":1} gap=8 padding=[14,100] alignItems=center}
    text "c0" {fill=$muted fontFamily=$font-mono fontSize=12 fontWeight=normal}  ← "Projects"
    text "sep0" {fill=$border-subtle fontFamily=$font-mono fontSize=12 fontWeight=normal}  ← "/"
    text "c1" {fill=$muted fontFamily=$font-mono fontSize=12 fontWeight=normal}  ← "Oil & Gas"
    text "sep1" {fill=$border-subtle fontFamily=$font-mono fontSize=12 fontWeight=normal}  ← "/"
    text "c2" {fill=$ink fontFamily=$font-mono fontSize=12 fontWeight=normal}  ← "LNG terminal fire & gas upgrade"
  frame "Image Band" {width=fill_container height=360 fill=$surface-2 stroke=$border-subtle strokeWidth={"bottom":1} layout=vertical gap=16 justifyContent=center alignItems=center}
    icon "ProdIcon" {width=88 height=88 fill=$ink-2 icon=flame}
    text "cap" {fill=$muted fontFamily=$font-mono fontSize=11 fontWeight=normal letterSpacing=1}  ← "FIG. — LNG TERMINAL FIRE & GAS COVERAGE SCHEMATIC"
    frame "tag" {fill=$surface stroke=$border-subtle strokeWidth=1 gap=8 padding=[6,12] alignItems=center}
      text "t" {fill=$ink-2 fontFamily=$font-mono fontSize=11 fontWeight=normal letterSpacing=1}  ← "OIL & GAS"
      text "d" {fill=$muted fontFamily=$font-mono fontSize=11 fontWeight=normal}  ← "·"
      text "y" {fill=$brand fontFamily=$font-mono fontSize=11 fontWeight=normal letterSpacing=1}  ← "DELIVERED 2024"
  frame "Overview" {width=fill_container fill=$surface gap=56 padding=[48,100]}
    frame "Ov Left" {width=fill_container layout=vertical gap=20}
      text "kick" {fill=$accent-soft fontFamily=$font-mono fontSize=11 fontWeight=normal letterSpacing=2}  ← "PROJECT CASE STUDY"
      text "H1" {width=fill_container fill=$ink fontFamily=$font-heading fontSize=40 fontWeight=700 lineHeight=1.1 letterSpacing=-1 textGrowth=fixed-width}  ← "LNG terminal fire & gas upgrade"
      text "lead" {width=fill_container fill=$ink fontFamily=$font-body fontSize=17 fontWeight=normal lineHeight=1.5 textGrowth=fixed-width}  ← "A full fire-and-gas detection and suppression package for a new LNG import terminal — 142 "
      text "body" {width=fill_container fill=$ink-2 fontFamily=$font-body fontSize=15 fontWeight=normal lineHeight=1.6 textGrowth=fixed-width}  ← "The operator needed a single supplier to take the hazardous-area detection scope from spec"
    frame "Facts Card" {width=380 fill=$surface stroke=$border-subtle strokeWidth=1 layout=vertical}
      frame "fch" {width=fill_container stroke=$border-subtle strokeWidth={"bottom":1} padding=[16,20]}
        text "t" {fill=$muted fontFamily=$font-mono fontSize=11 fontWeight=normal letterSpacing=1.5}  ← "PROJECT FACTS"
      frame "fcb" {width=fill_container layout=vertical gap=16 padding=20}
        frame "CLIENT" {width=fill_container gap=14}
          text "k" {width=92 fill=$muted fontFamily=$font-mono fontSize=11 fontWeight=normal letterSpacing=1 textGrowth=fixed-width}  ← "CLIENT"
          text "v" {width=fill_container fill=$ink fontFamily=$font-data fontSize=13 fontWeight=normal lineHeight=1.4 textGrowth=fixed-width}  ← "LNG terminal operator"
        frame "SECTOR" {width=fill_container gap=14}
          text "k" {width=92 fill=$muted fontFamily=$font-mono fontSize=11 fontWeight=normal letterSpacing=1 textGrowth=fixed-width}  ← "SECTOR"
          text "v" {width=fill_container fill=$ink fontFamily=$font-data fontSize=13 fontWeight=normal lineHeight=1.4 textGrowth=fixed-width}  ← "Oil & Gas / Energy"
        frame "LOCATION" {width=fill_container gap=14}
          text "k" {width=92 fill=$muted fontFamily=$font-mono fontSize=11 fontWeight=normal letterSpacing=1 textGrowth=fixed-width}  ← "LOCATION"
          text "v" {width=fill_container fill=$ink fontFamily=$font-data fontSize=13 fontWeight=normal lineHeight=1.4 textGrowth=fixed-width}  ← "Marmara, Türkiye"
        frame "DELIVERED" {width=fill_container gap=14}
          text "k" {width=92 fill=$muted fontFamily=$font-mono fontSize=11 fontWeight=normal letterSpacing=1 textGrowth=fixed-width}  ← "DELIVERED"
          text "v" {width=fill_container fill=$ink fontFamily=$font-data fontSize=13 fontWeight=normal lineHeight=1.4 textGrowth=fixed-width}  ← "2024"
        frame "SCOPE" {width=fill_container gap=14}
          text "k" {width=92 fill=$muted fontFamily=$font-mono fontSize=11 fontWeight=normal letterSpacing=1 textGrowth=fixed-width}  ← "SCOPE"
          text "v" {width=fill_container fill=$ink fontFamily=$font-data fontSize=13 fontWeight=normal lineHeight=1.4 textGrowth=fixed-width}  ← "Fire & gas detection + suppression"
        frame "LEAD TIME" {width=fill_container gap=14}
          text "k" {width=92 fill=$muted fontFamily=$font-mono fontSize=11 fontWeight=normal letterSpacing=1 textGrowth=fixed-width}  ← "LEAD TIME"
          text "v" {width=fill_container fill=$ink fontFamily=$font-data fontSize=13 fontWeight=normal lineHeight=1.4 textGrowth=fixed-width}  ← "6 weeks"
      frame "fcc" {width=fill_container stroke=$border-subtle strokeWidth={"top":1} layout=vertical gap=10 padding=20}
        frame "Primary" {width=fill_container fill=$accent gap=8 padding=[13,20] justifyContent=center alignItems=center}
          text "l" {fill=#FFFFFF fontFamily=$font-body fontSize=15 fontWeight=600}  ← "I have a similar project"
          icon "a" {width=16 height=16 fill=#FFFFFF icon=arrow-right}
        frame "Secondary" {width=fill_container fill=$surface stroke=$ink strokeWidth=1.5 gap=8 padding=[12,20] justifyContent=center alignItems=center}
          icon "i" {width=15 height=15 fill=$ink icon=phone}
          text "l" {fill=$ink fontFamily=$font-body fontSize=14 fontWeight=600}  ← "Talk to an engineer"
        text "trust" {width=fill_container fill=$muted fontFamily=$font-mono fontSize=11 fontWeight=normal lineHeight=1.4 textGrowth=fixed-width}  ← "We'll pre-fill your inquiry with this project's scope."
  frame "Outcomes Band" {width=fill_container fill=$ink padding=[44,100]}
    frame "FIELD DEVICES SUPPLIED" {width=fill_container layout=vertical gap=8}
      text "n" {fill=#FFFFFF fontFamily=$font-mono fontSize=36 fontWeight=normal}  ← "142"
      text "l" {fill=$muted fontFamily=$font-mono fontSize=11 fontWeight=normal letterSpacing=1}  ← "FIELD DEVICES SUPPLIED"
    frame "SPEC TO SITE" {width=fill_container stroke=#2A3340 strokeWidth={"left":1} layout=vertical gap=8 padding=[0,0,0,44]}
      text "n" {fill=#FFFFFF fontFamily=$font-mono fontSize=36 fontWeight=normal}  ← "6 wk"
      text "l" {fill=$muted fontFamily=$font-mono fontSize=11 fontWeight=normal letterSpacing=1}  ← "SPEC TO SITE"
    frame "STANDARDS CERTIFIED" {width=fill_container stroke=#2A3340 strokeWidth={"left":1} layout=vertical gap=8 padding=[0,0,0,44]}
      text "n" {fill=#FFFFFF fontFamily=$font-mono fontSize=36 fontWeight=normal}  ← "4"
      text "l" {fill=$muted fontFamily=$font-mono fontSize=11 fontWeight=normal letterSpacing=1}  ← "STANDARDS CERTIFIED"
    frame "ON-TIME DELIVERY" {width=fill_container stroke=#2A3340 strokeWidth={"left":1} layout=vertical gap=8 padding=[0,0,0,44]}
      text "n" {fill=#FFFFFF fontFamily=$font-mono fontSize=36 fontWeight=normal}  ← "100%"
      text "l" {fill=$muted fontFamily=$font-mono fontSize=11 fontWeight=normal letterSpacing=1}  ← "ON-TIME DELIVERY"
  frame "Section Scope" {width=fill_container fill=$surface stroke=$border-subtle strokeWidth={"top":1} layout=vertical gap=24 padding=[56,100]}
    frame "Head" {width=fill_container layout=vertical gap=8}
      text "kick" {fill=$accent-soft fontFamily=$font-mono fontSize=11 fontWeight=normal letterSpacing=1.5}  ← "SCOPE OF SUPPLY"
      text "h2" {fill=$ink fontFamily=$font-heading fontSize=28 fontWeight=700 letterSpacing=-0.5}  ← "One consolidated bill of materials"
      text "sub" {width=720 fill=$ink-2 fontFamily=$font-body fontSize=15 fontWeight=normal lineHeight=1.5 textGrowth=fixed-width}  ← "Five equipment lines across four manufacturers — specced, procured and kitted as a single "
    frame "BOM Table" {width=fill_container stroke=$border-subtle strokeWidth=1 layout=vertical}
      frame "hrow" {width=fill_container fill=$surface-2 stroke=$border-subtle strokeWidth={"bottom":1} padding=[0,20] alignItems=center}
        frame "h_CATEGORY" {width=fill_container padding=[12,0]}
          text "t" {fill=$muted fontFamily=$font-mono fontSize=11 fontWeight=normal letterSpacing=1}  ← "CATEGORY"
        frame "h_MODEL" {width=220 padding=[12,0]}
          text "t" {fill=$muted fontFamily=$font-mono fontSize=11 fontWeight=normal letterSpacing=1}  ← "MODEL"
        frame "h_MANUFACTURER" {width=200 padding=[12,0]}
          text "t" {fill=$muted fontFamily=$font-mono fontSize=11 fontWeight=normal letterSpacing=1}  ← "MANUFACTURER"
        frame "h_QTY" {width=90 padding=[12,0] justifyContent=end}
          text "t" {fill=$muted fontFamily=$font-mono fontSize=11 fontWeight=normal letterSpacing=1}  ← "QTY"
      frame "r0" {width=fill_container fill=$surface stroke=$border-subtle strokeWidth={"bottom":1} padding=[0,20] alignItems=center}
        frame "c1" {width=fill_container padding=[15,0]}
          text "t" {fill=$ink fontFamily=$font-body fontSize=14 fontWeight=600}  ← "Triple-IR flame detection"
        frame "c2" {width=220 padding=[15,0]}
          text "t" {fill=$accent fontFamily=$font-data fontSize=13 fontWeight=normal}  ← "FD-9500"
        frame "c3" {width=200 padding=[15,0]}
          text "t" {fill=$ink-2 fontFamily=$font-body fontSize=13 fontWeight=normal}  ← "Sentra Fire"
        frame "c4" {width=90 padding=[15,0] justifyContent=end}
          text "t" {fill=$ink fontFamily=$font-data fontSize=14 fontWeight=normal}  ← "142"
      frame "r1" {width=fill_container fill=$surface stroke=$border-subtle strokeWidth={"bottom":1} padding=[0,20] alignItems=center}
        frame "c1" {width=fill_container padding=[15,0]}
          text "t" {fill=$ink fontFamily=$font-body fontSize=14 fontWeight=600}  ← "Fixed gas detection"
        frame "c2" {width=220 padding=[15,0]}
          text "t" {fill=$accent fontFamily=$font-data fontSize=13 fontWeight=normal}  ← "GD-410"
        frame "c3" {width=200 padding=[15,0]}
          text "t" {fill=$ink-2 fontFamily=$font-body fontSize=13 fontWeight=normal}  ← "Gastec"
        frame "c4" {width=90 padding=[15,0] justifyContent=end}
          text "t" {fill=$ink fontFamily=$font-data fontSize=14 fontWeight=normal}  ← "88"
      frame "r2" {width=fill_container fill=$surface stroke=$border-subtle strokeWidth={"bottom":1} padding=[0,20] alignItems=center}
        frame "c1" {width=fill_container padding=[15,0]}
          text "t" {fill=$ink fontFamily=$font-body fontSize=14 fontWeight=600}  ← "Ex-proof alarm beacons"
        frame "c2" {width=220 padding=[15,0]}
          text "t" {fill=$accent fontFamily=$font-data fontSize=13 fontWeight=normal}  ← "XB-200"
        frame "c3" {width=200 padding=[15,0]}
          text "t" {fill=$ink-2 fontFamily=$font-body fontSize=13 fontWeight=normal}  ← "Exlume"
        frame "c4" {width=90 padding=[15,0] justifyContent=end}
          text "t" {fill=$ink fontFamily=$font-data fontSize=14 fontWeight=normal}  ← "60"
      frame "r3" {width=fill_container fill=$surface stroke=$border-subtle strokeWidth={"bottom":1} padding=[0,20] alignItems=center}
        frame "c1" {width=fill_container padding=[15,0]}
          text "t" {fill=$ink fontFamily=$font-body fontSize=14 fontWeight=600}  ← "SCBA rescue sets"
        frame "c2" {width=220 padding=[15,0]}
          text "t" {fill=$accent fontFamily=$font-data fontSize=13 fontWeight=normal}  ← "AS-60"
        frame "c3" {width=200 padding=[15,0]}
          text "t" {fill=$ink-2 fontFamily=$font-body fontSize=13 fontWeight=normal}  ← "Aerosafe"
        frame "c4" {width=90 padding=[15,0] justifyContent=end}
          text "t" {fill=$ink fontFamily=$font-data fontSize=14 fontWeight=normal}  ← "24"
      frame "r4" {width=fill_container fill=$surface stroke=$border-subtle strokeWidth={"bottom":1} padding=[0,20] alignItems=center}
        frame "c1" {width=fill_container padding=[15,0]}
          text "t" {fill=$ink fontFamily=$font-body fontSize=14 fontWeight=600}  ← "Clean-agent suppression skid"
        frame "c2" {width=220 padding=[15,0]}
          text "t" {fill=$accent fontFamily=$font-data fontSize=13 fontWeight=normal}  ← "FM-200 skid"
        frame "c3" {width=200 padding=[15,0]}
          text "t" {fill=$ink-2 fontFamily=$font-body fontSize=13 fontWeight=normal}  ← "—"
        frame "c4" {width=90 padding=[15,0] justifyContent=end}
          text "t" {fill=$ink fontFamily=$font-data fontSize=14 fontWeight=normal}  ← "3"
      frame "foot" {width=fill_container fill=$surface-2 padding=[14,20] justifyContent=space_between alignItems=center}
        text "l" {fill=$muted fontFamily=$font-mono fontSize=11 fontWeight=normal letterSpacing=1}  ← "5 line items"
        text "r" {fill=$ink fontFamily=$font-data fontSize=14 fontWeight=600}  ← "317 units total"
  frame "Section Equipment" {width=fill_container fill=$surface-2 stroke=$border-subtle strokeWidth={"top":1} layout=vertical gap=28 padding=[56,100]}
    frame "Head" {width=fill_container gap=20 justifyContent=space_between alignItems=end}
      frame "HL" {layout=vertical gap=7}
        text "kick" {fill=$accent-soft fontFamily=$font-mono fontSize=11 fontWeight=normal letterSpacing=1.5}  ← "EQUIPMENT SUPPLIED"
        text "h2" {fill=$ink fontFamily=$font-heading fontSize=28 fontWeight=700 letterSpacing=-0.5}  ← "What went into this project"
      frame "HR" {gap=7 alignItems=center}
        text "t" {fill=$accent fontFamily=$font-body fontSize=14 fontWeight=600}  ← "View all in catalog"
        icon "a" {width=15 height=15 fill=$accent icon=arrow-right}
    frame "Eq Row" {width=fill_container gap=20}
      ref "FD-9500 triple-IR flame detector" {width=fill_container}
      ref "GD-410 fixed gas detector" {width=fill_container}
      ref "XB-200 Ex-proof beacon" {width=fill_container}
      ref "AS-60 SCBA air set" {width=fill_container}
  frame "Section Process" {width=fill_container fill=$surface stroke=$border-subtle strokeWidth={"top":1} layout=vertical gap=28 padding=[56,100]}
    frame "Head" {width=fill_container layout=vertical gap=10}
      text "kick" {fill=$accent-soft fontFamily=$font-mono fontSize=11 fontWeight=normal letterSpacing=1.5}  ← "HOW WE DELIVERED"
      text "h2" {fill=$ink fontFamily=$font-heading fontSize=28 fontWeight=700 letterSpacing=-0.5}  ← "Spec to site in six weeks"
      text "sub" {width=720 fill=$ink-2 fontFamily=$font-body fontSize=15 fontWeight=normal lineHeight=1.5 textGrowth=fixed-width}  ← "Visible process, no black box — every stage against a fixed terminal start-up date."
    frame "Step Row" {width=fill_container}
      frame "Enquiry & scope" {width=fill_container layout=vertical gap=12 padding=[0,20,0,0]}
        text "num" {fill=$accent-soft fontFamily=$font-mono fontSize=24 fontWeight=700}  ← "01"
        text "t" {width=fill_container fill=$ink fontFamily=$font-heading fontSize=16 fontWeight=600 lineHeight=1.25 textGrowth=fixed-width}  ← "Enquiry & scope"
        text "d" {width=fill_container fill=$ink-2 fontFamily=$font-body fontSize=13 fontWeight=normal lineHeight=1.5 textGrowth=fixed-width}  ← "We mapped every zone classification and detection requirement."
        frame "wk" {fill=$surface-2 stroke=$border-subtle strokeWidth=1 padding=[4,9]}
          text "w" {fill=$ink-2 fontFamily=$font-mono fontSize=10 fontWeight=normal letterSpacing=1}  ← "Week 1"
      frame "Technical selection" {width=fill_container stroke=$border-subtle strokeWidth={"left":1} layout=vertical gap=12 padding=[0,20,0,24]}
        text "num" {fill=$accent-soft fontFamily=$font-mono fontSize=24 fontWeight=700}  ← "02"
        text "t" {width=fill_container fill=$ink fontFamily=$font-heading fontSize=16 fontWeight=600 lineHeight=1.25 textGrowth=fixed-width}  ← "Technical selection"
        text "d" {width=fill_container fill=$ink-2 fontFamily=$font-body fontSize=13 fontWeight=normal lineHeight=1.5 textGrowth=fixed-width}  ← "Matched five equipment lines to spec, standards and budget."
        frame "wk" {fill=$surface-2 stroke=$border-subtle strokeWidth=1 padding=[4,9]}
          text "w" {fill=$ink-2 fontFamily=$font-mono fontSize=10 fontWeight=normal letterSpacing=1}  ← "Week 1–2"
      frame "Compliance pack" {width=fill_container stroke=$border-subtle strokeWidth={"left":1} layout=vertical gap=12 padding=[0,20,0,24]}
        text "num" {fill=$accent-soft fontFamily=$font-mono fontSize=24 fontWeight=700}  ← "03"
        text "t" {width=fill_container fill=$ink fontFamily=$font-heading fontSize=16 fontWeight=600 lineHeight=1.25 textGrowth=fixed-width}  ← "Compliance pack"
        text "d" {width=fill_container fill=$ink-2 fontFamily=$font-body fontSize=13 fontWeight=normal lineHeight=1.5 textGrowth=fixed-width}  ← "Assembled datasheets, certificates and a compliance matrix."
        frame "wk" {fill=$surface-2 stroke=$border-subtle strokeWidth=1 padding=[4,9]}
          text "w" {fill=$ink-2 fontFamily=$font-mono fontSize=10 fontWeight=normal letterSpacing=1}  ← "Week 2–3"
      frame "Supply & kitting" {width=fill_container stroke=$border-subtle strokeWidth={"left":1} layout=vertical gap=12 padding=[0,20,0,24]}
        text "num" {fill=$accent-soft fontFamily=$font-mono fontSize=24 fontWeight=700}  ← "04"
        text "t" {width=fill_container fill=$ink fontFamily=$font-heading fontSize=16 fontWeight=600 lineHeight=1.25 textGrowth=fixed-width}  ← "Supply & kitting"
        text "d" {width=fill_container fill=$ink-2 fontFamily=$font-body fontSize=13 fontWeight=normal lineHeight=1.5 textGrowth=fixed-width}  ← "Procured across four manufacturers; consolidated into labelled kits."
        frame "wk" {fill=$surface-2 stroke=$border-subtle strokeWidth=1 padding=[4,9]}
          text "w" {fill=$ink-2 fontFamily=$font-mono fontSize=10 fontWeight=normal letterSpacing=1}  ← "Week 3–5"
      frame "Delivery & commissioning" {width=fill_container stroke=$border-subtle strokeWidth={"left":1} layout=vertical gap=12 padding=[0,20,0,24]}
        text "num" {fill=$accent-soft fontFamily=$font-mono fontSize=24 fontWeight=700}  ← "05"
        text "t" {width=fill_container fill=$ink fontFamily=$font-heading fontSize=16 fontWeight=600 lineHeight=1.25 textGrowth=fixed-width}  ← "Delivery & commissioning"
        text "d" {width=fill_container fill=$ink-2 fontFamily=$font-body fontSize=13 fontWeight=normal lineHeight=1.5 textGrowth=fixed-width}  ← "Shipped with customs cleared; supported site commissioning."
        frame "wk" {fill=$surface-2 stroke=$border-subtle strokeWidth=1 padding=[4,9]}
          text "w" {fill=$ink-2 fontFamily=$font-mono fontSize=10 fontWeight=normal letterSpacing=1}  ← "Week 6"
  frame "Section Related" {width=fill_container fill=$surface-2 stroke=$border-subtle strokeWidth={"top":1} layout=vertical gap=28 padding=[56,100]}
    frame "Head" {width=fill_container gap=20 justifyContent=space_between alignItems=end}
      frame "HL" {layout=vertical gap=7}
        text "kick" {fill=$accent-soft fontFamily=$font-mono fontSize=11 fontWeight=normal letterSpacing=1.5}  ← "MORE PROOF"
        text "h2" {fill=$ink fontFamily=$font-heading fontSize=28 fontWeight=700 letterSpacing=-0.5}  ← "More in oil & gas"
      frame "HR" {gap=7 alignItems=center}
        text "t" {fill=$accent fontFamily=$font-body fontSize=14 fontWeight=600}  ← "All projects"
        icon "a" {width=15 height=15 fill=$accent icon=arrow-right}
    frame "Rel Row" {width=fill_container gap=20}
      frame "Refinery gas-detection retrofit" {width=fill_container fill=$surface stroke=$border-subtle strokeWidth=1 layout=vertical}
        frame "band" {width=fill_container height=140 fill=$surface-2 stroke=$border-subtle strokeWidth={"bottom":1} layout=vertical justifyContent=center alignItems=center}
          icon "ic" {width=42 height=42 fill=$ink-2 icon=gauge}
        frame "body" {width=fill_container layout=vertical gap=10 padding=20}
          frame "tag" {fill=$surface-2 stroke=$border-subtle strokeWidth=1 padding=[4,9]}
            text "t" {fill=$ink-2 fontFamily=$font-mono fontSize=10 fontWeight=normal letterSpacing=1}  ← "OIL & GAS"
          text "title" {width=fill_container fill=$ink fontFamily=$font-heading fontSize=18 fontWeight=600 lineHeight=1.25 textGrowth=fixed-width}  ← "Refinery gas-detection retrofit"
          text "meta" {fill=$muted fontFamily=$font-data fontSize=12 fontWeight=normal}  ← "210 sensors · Russia"
          frame "view" {gap=6 padding=[8,0,0,0] alignItems=center}
            text "t" {fill=$accent fontFamily=$font-body fontSize=13 fontWeight=600}  ← "View project"
            icon "a" {width=14 height=14 fill=$accent icon=arrow-right}
      frame "Platform suppression package" {width=fill_container fill=$surface stroke=$border-subtle strokeWidth=1 layout=vertical}
        frame "band" {width=fill_container height=140 fill=$surface-2 stroke=$border-subtle strokeWidth={"bottom":1} layout=vertical justifyContent=center alignItems=center}
          icon "ic" {width=42 height=42 fill=$ink-2 icon=droplets}
        frame "body" {width=fill_container layout=vertical gap=10 padding=20}
          frame "tag" {fill=$surface-2 stroke=$border-subtle strokeWidth=1 padding=[4,9]}
            text "t" {fill=$ink-2 fontFamily=$font-mono fontSize=10 fontWeight=normal letterSpacing=1}  ← "OFFSHORE"
          text "title" {width=fill_container fill=$ink fontFamily=$font-heading fontSize=18 fontWeight=600 lineHeight=1.25 textGrowth=fixed-width}  ← "Platform suppression package"
          text "meta" {fill=$muted fontFamily=$font-data fontSize=12 fontWeight=normal}  ← "CO₂ + foam · Caspian"
          frame "view" {gap=6 padding=[8,0,0,0] alignItems=center}
            text "t" {fill=$accent fontFamily=$font-body fontSize=13 fontWeight=600}  ← "View project"
            icon "a" {width=14 height=14 fill=$accent icon=arrow-right}
      frame "Tank-farm flame coverage" {width=fill_container fill=$surface stroke=$border-subtle strokeWidth=1 layout=vertical}
        frame "band" {width=fill_container height=140 fill=$surface-2 stroke=$border-subtle strokeWidth={"bottom":1} layout=vertical justifyContent=center alignItems=center}
          icon "ic" {width=42 height=42 fill=$ink-2 icon=fuel}
        frame "body" {width=fill_container layout=vertical gap=10 padding=20}
          frame "tag" {fill=$surface-2 stroke=$border-subtle strokeWidth=1 padding=[4,9]}
            text "t" {fill=$ink-2 fontFamily=$font-mono fontSize=10 fontWeight=normal letterSpacing=1}  ← "PETROCHEMICAL"
          text "title" {width=fill_container fill=$ink fontFamily=$font-heading fontSize=18 fontWeight=600 lineHeight=1.25 textGrowth=fixed-width}  ← "Tank-farm flame coverage"
          text "meta" {fill=$muted fontFamily=$font-data fontSize=12 fontWeight=normal}  ← "88 units · Azerbaijan"
          frame "view" {gap=6 padding=[8,0,0,0] alignItems=center}
            text "t" {fill=$accent fontFamily=$font-body fontSize=13 fontWeight=600}  ← "View project"
            icon "a" {width=14 height=14 fill=$accent icon=arrow-right}
  frame "CTA Band" {width=fill_container fill=$ink gap=40 padding=[56,100] alignItems=center}
    frame "Left" {width=fill_container layout=vertical gap=10}
      text "kick" {fill=$accent-soft fontFamily=$font-mono fontSize=11 fontWeight=normal letterSpacing=1.5}  ← "SIMILAR PROJECT?"
      text "h" {width=fill_container fill=#FFFFFF fontFamily=$font-heading fontSize=30 fontWeight=700 letterSpacing=-0.5 textGrowth=fixed-width}  ← "Start your inquiry from this project"
      text "s" {width=fill_container fill=$muted fontFamily=$font-body fontSize=14 fontWeight=normal lineHeight=1.5 textGrowth=fixed-width}  ← "We'll open an inquiry pre-filled with this project's scope — swap models, adjust quantitie"
    frame "Right" {width=320 layout=vertical gap=12}
      frame "Primary" {width=fill_container fill=$surface gap=8 padding=[14,24] justifyContent=center alignItems=center}
        text "l" {fill=$ink fontFamily=$font-body fontSize=15 fontWeight=600}  ← "Start from this project"
        icon "a" {width=16 height=16 fill=$ink icon=arrow-right}
      frame "Secondary" {width=fill_container fill=$ink stroke=#FFFFFF strokeWidth=1 gap=8 padding=[13,24] justifyContent=center alignItems=center}
        icon "i" {width=15 height=15 fill=#FFFFFF icon=phone}
        text "l" {fill=#FFFFFF fontFamily=$font-body fontSize=14 fontWeight=600}  ← "Talk to an engineer"
```
