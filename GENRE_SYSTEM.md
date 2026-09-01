# HeyKasa Genre System

This project uses MongoDB and Mongoose for music taxonomy. There is no admin role: the application seeds a shared, code-owned taxonomy, while user-created genres and tags are private to the user who created them. A private entry can affect that listener's recommendations without polluting the shared catalog.

## Data Model

### Genres collection

`src/models/Genre.js` stores canonical genres and their tree relationship.

```js
{
  _id: ObjectId,
  displayName: "Heavy Metal",
  normalizedName: "heavy metal",
  slug: "metal--heavy-metal",
  parentId: ObjectId("...") || null,
  ancestorIds: [ObjectId("metal root")],
  depth: 1,                    // 0 through 3; four levels total
  aliases: ["heavy-metal"],
  aliasKeys: ["heavy metal"],
  translations: { en: "Heavy Metal", es: "Heavy Metal" },
  scope: "system" | "personal",
  ownerId: ObjectId("...") || null,
  createdAt: Date,
  updatedAt: Date
}
```

Indexes:

```js
{ slug: 1 } // unique
{ scope: 1, ownerId: 1, parentId: 1, normalizedName: 1 } // unique
{ ancestorIds: 1 } // subtree lookups
{ aliasKeys: 1 } // alias autocomplete and deduplication
{ scope: 1, ownerId: 1, depth: 1, displayName: 1 } // tree browsing
```

### Tags collection

`src/models/Tag.js` is intentionally separate from genres. Tags express information that can cross genre boundaries: mood, era, scene, production, instrumentation, language, region, or theme.

```js
{
  _id: ObjectId,
  displayName: "Lo-fi",
  normalizedName: "lo fi",
  slug: "tag-lo-fi",
  category: "production",
  aliases: ["lofi"],
  aliasKeys: ["lofi"],
  translations: { en: "Lo-fi" },
  scope: "system" | "personal",
  ownerId: ObjectId("...") || null
}
```

### Tracks and artists

The current app streams external YouTube tracks and does not yet persist a first-party track catalog. When it does, use embedded assignment documents for many-to-many genre relationships and ID arrays for tags:

```js
// tracks collection
{
  source: "youtube",
  sourceId: "video-id",
  title: "Example Song",
  artistIds: [ObjectId("...")],
  genreAssignments: [
    { genreId: ObjectId("..."), weight: 0.95, source: "editorial" },
    { genreId: ObjectId("..."), weight: 0.72, source: "classifier" }
  ],
  tagIds: [ObjectId("..."), ObjectId("...")]
}

// artists collection
{
  name: "Example Artist",
  genreIds: [ObjectId("..."), ObjectId("...")],
  tagIds: [ObjectId("...")]
}
```

Recommended catalog indexes:

```js
db.tracks.createIndex({ source: 1, sourceId: 1 }, { unique: true });
db.tracks.createIndex({ "genreAssignments.genreId": 1 });
db.tracks.createIndex({ tagIds: 1 });
db.artists.createIndex({ genreIds: 1 });
db.artists.createIndex({ tagIds: 1 });
```

`UserData` keeps readable `genres` and `tags` arrays for current recommendation/search behavior and `genreIds` and `tagIds` for canonical joins.

## Major Genre Taxonomy

The shared seed has exactly 20 roots. Each root below lists a definition, representative child genres, and example cross-cutting tags.

### 1. Pop

Definition: Melody-forward popular music designed for broad accessibility and concise song forms.

Subgenres: Dance Pop, Electropop, Synth-pop, Teen Pop, Art Pop, Indie Pop.

Tags: catchy, radio, upbeat, love, danceable, polished, 2000s, mainstream.

### 2. Rock

Definition: Guitar-led music rooted in rock and roll, from radio rock to experimental guitar styles.

Subgenres: Alternative Rock, Classic Rock, Hard Rock, Progressive Rock, Garage Rock, Psychedelic Rock.

Tags: guitar, live, anthemic, rebellious, classic, alternative, stadium, indie.

### 3. Hip Hop & Rap

Definition: Rhythm-led music centered on rap vocals, beatmaking, DJ culture, and hip-hop scenes.

Subgenres: Boom Bap, Trap, Drill, Conscious Hip Hop, Cloud Rap, Lo-fi Hip Hop.

Tags: lyricism, beat-driven, explicit, freestyle, underground, club, street, 1990s.

### 4. Electronic & Dance

Definition: Music primarily made with electronic production techniques, including club and ambient forms.

Subgenres: House, Techno, Trance, Drum & Bass, Dubstep, Ambient.

Tags: club, DJ, synth, rave, festival, instrumental, nocturnal, bass-heavy.

### 5. R&B & Soul

Definition: Vocal-centered Black American music traditions spanning rhythm and blues, soul, and funk.

Subgenres: Contemporary R&B, Neo Soul, Funk, Motown, Quiet Storm, Gospel.

Tags: vocal, romantic, smooth, sensual, soulful, slow jam, polished, late night.

### 6. Jazz

Definition: Improvisation-centered music with roots in African American musical traditions.

Subgenres: Bebop, Swing, Cool Jazz, Jazz Fusion, Free Jazz, Smooth Jazz.

Tags: improvisation, instrumental, lounge, swing, sophisticated, acoustic, live, late night.

### 7. Classical & Orchestral

Definition: Composed concert music, orchestral works, opera, and related contemporary traditions.

Subgenres: Baroque, Romantic, Chamber Music, Opera, Contemporary Classical, Film Score.

Tags: orchestral, instrumental, piano, strings, study, cinematic, chamber, ambient.

### 8. Country

Definition: Song-driven music rooted in North American rural and roots traditions.

Subgenres: Traditional Country, Country Pop, Americana, Bluegrass, Outlaw Country, Alt-Country.

Tags: storytelling, guitar, road trip, southern, heartfelt, acoustic, twang, Americana.

### 9. Folk & Acoustic

Definition: Acoustic and roots-oriented songwriting connected to folk traditions and singer-songwriters.

Subgenres: Contemporary Folk, Singer-Songwriter, Indie Folk, Celtic Folk, American Roots, Acoustic.

Tags: acoustic, storytelling, roots, intimate, campfire, indie, live, organic.

### 10. Metal

Definition: Amplified, high-intensity guitar music with heavy riffs and distinctive subcultural scenes.

Subgenres: Heavy Metal, Thrash Metal, Death Metal, Black Metal, Doom Metal, Power Metal.

Tags: heavy, guitar, aggressive, dark, technical, live, underground, intense.

### 11. Punk & Hardcore

Definition: Fast, direct, DIY-oriented guitar music spanning punk and hardcore communities.

Subgenres: Punk Rock, Hardcore Punk, Post-Punk, Pop Punk, Emo, Ska Punk.

Tags: DIY, fast, rebellious, raw, skate, underground, live, political.

### 12. Blues

Definition: Music rooted in blues forms, expressive vocals, and guitar or piano traditions.

Subgenres: Delta Blues, Chicago Blues, Electric Blues, Blues Rock, Piedmont Blues, Modern Blues.

Tags: guitar, soulful, raw, roots, live, smoky, classic, melancholic.

### 13. Reggae & Caribbean

Definition: Caribbean music traditions from Jamaica and the wider region, including sound-system culture.

Subgenres: Roots Reggae, Dancehall, Dub, Ska, Rocksteady, Soca.

Tags: warm, bass, dub, summer, roots, dance, island, sound-system.

### 14. Latin

Definition: Music from Latin America and its diasporas, across Spanish, Portuguese, and Indigenous traditions.

Subgenres: Reggaeton, Salsa, Bachata, Cumbia, Latin Pop, Regional Mexican.

Tags: dance, Spanish, party, romantic, percussion, summer, club, regional.

### 15. African

Definition: Contemporary and traditional music from African regions and diasporas.

Subgenres: Afrobeats, Highlife, Amapiano, Afro-house, Benga, Mbalax.

Tags: afrodiaspora, dance, percussion, diaspora, party, regional, club, warm.

### 16. Middle Eastern & North African

Definition: Music from the Middle East and North Africa, including Arabic, Persian, Turkish, and regional traditions.

Subgenres: Arabic Pop, Rai, Khaliji, Dabke, Persian Pop, Turkish Pop.

Tags: regional, traditional, dance, Arabic, diaspora, percussion, romantic, oud.

### 17. South Asian

Definition: Music from South Asia and its diaspora, spanning classical, film, pop, and regional traditions.

Subgenres: Bollywood, Indian Classical, Bhangra, Carnatic, Hindustani, Pakistani Pop.

Tags: regional, film, dance, diaspora, traditional, vocals, celebration, percussion.

### 18. East & Southeast Asian

Definition: Contemporary and traditional music from East and Southeast Asia and related diasporas.

Subgenres: K-pop, J-pop, Mandopop, C-pop, City Pop, P-pop.

Tags: idol, city, anime, dance, regional, pop, soundtrack, language.

### 19. World & Traditional

Definition: Traditional, regional, and culturally specific music that does not fit a narrower top-level branch.

Subgenres: Balkan Folk, Celtic, Fado, Flamenco, Qawwali, Indigenous Music.

Tags: traditional, roots, regional, heritage, acoustic, dance, live, cultural.

### 20. Experimental & Avant-Garde

Definition: Boundary-pushing music that prioritizes unconventional form, sound design, or composition.

Subgenres: Avant-Garde, Noise, Musique Concrete, Minimalism, Industrial, Glitch.

Tags: abstract, noise, art, ambient, instrumental, avant-garde, underground, sound-design.

## Genre Versus Tag Decisions

| Input | Model | Reason |
| --- | --- | --- |
| Heavy Metal | Subgenre under Metal | It is a stable style with a clear musical lineage. |
| Drum & Bass | Subgenre under Electronic & Dance | It has consistent rhythmic and scene conventions. |
| Lo-fi | Production tag | It describes texture/production; `Lo-fi Hip Hop` is a distinct subgenre. |
| K-pop | Subgenre under East & Southeast Asian | It is a recognizable music ecosystem; language, idol culture, and Korean remain tags. |
| Afrobeats | Subgenre under African | It has a broad, stable contemporary repertoire. |
| 1990s | Era tag | A period can apply across all genres. |
| Underground | Scene tag | A scene/status can apply across all genres. |
| Acoustic | Production tag | It describes arrangement, not one musical lineage. |

Rules:

1. Add a major genre only when it has a distinct, durable musical lineage and needs a root for many child styles.
2. Add a subgenre when it has stable musical conventions and a meaningful parent relationship.
3. Add a tag when the label can describe music across multiple genre branches or captures mood, era, scene, production, language, region, instrumentation, or theme.
4. Use at most four tree levels: root (0), subgenre (1), style (2), and microgenre (3). Do not add a fifth layer; use tags or aliases instead.
5. A mashup receives multiple genre assignments. For example, a pop-punk track can have `Pop Punk` plus a `catchy` tag; do not create a `Pop Punk Rock` branch.

## Naming and Deduplication

The normalizer in `src/utils/genreTaxonomy.js`:

1. trims whitespace and Unicode-normalizes input;
2. lowercases text;
3. treats `&` as `and`;
4. removes punctuation and collapses whitespace;
5. preserves non-Latin letters and numbers for multilingual names.

Examples: `Hip-Hop`, `hip hop`, and `HIP HOP` normalize to `hip hop`; `R&B` normalizes to `r and b`; `LoFi` and `lo-fi` can be linked through the `lofi` alias key.

Before creating a personal entry, the API checks its normalized name against all shared names and aliases, then against the current user's personal entries. A matching canonical genre is returned instead of creating a duplicate. System and personal entries also have MongoDB unique compound indexes as a final guard.

## User Experience

1. Settings shows the 20 major genres as fast toggle buttons.
2. Search matches canonical names and aliases, returning both major genres and nested subgenres.
3. If no exact match exists, an authenticated user can add the term as a personal genre. It is visible only to that user and can be removed later.
4. Tags use the same autocomplete pattern but display the tag category, such as `mood` or `production`, alongside the result.
5. Save no more than 12 favorite genres, 40 personal genres, and 80 personal tags per user.

## API Contract

### Browse or autocomplete genres

```http
GET /api/genres?locale=en&q=drum
```

```json
{
  "genres": [
    {
      "id": "66f000000000000000000001",
      "name": "Drum & Bass",
      "defaultName": "Drum & Bass",
      "slug": "electronic-dance--drum-and-bass",
      "parentId": "66f000000000000000000002",
      "depth": 1,
      "scope": "system"
    }
  ],
  "tree": [],
  "personalGenres": []
}
```

### Create a personal genre

```http
POST /api/genres
Content-Type: application/json

{ "name": "Dungeon Synth" }
```

```json
{
  "success": true,
  "created": true,
  "genre": {
    "id": "66f000000000000000000003",
    "name": "Dungeon Synth",
    "slug": "custom-user-id-dungeon-synth",
    "scope": "personal"
  }
}
```

### Save favorite genres

```http
POST /api/recommendations
Content-Type: application/json

{ "genres": ["Hip-Hop", "Drum & Bass", "Dungeon Synth"] }
```

The server resolves known aliases, stores readable names in `UserData.genres`, and stores canonical IDs in `UserData.genreIds`.

### Browse and manage tags

```http
GET /api/tags?q=lofi
POST /api/tags
DELETE /api/tags?id=tag-object-id
```

Example creation payload:

```json
{ "name": "Sunset Drive", "category": "mood" }
```

## MongoDB Queries

### Fetch every genre in a subtree

```js
const root = await Genre.findOne({ slug: "electronic-dance" }).select("_id").lean();
const subtree = await Genre.find({
  $or: [{ _id: root._id }, { ancestorIds: root._id }]
}).select("_id displayName").lean();

const tracks = await Track.find({
  "genreAssignments.genreId": { $in: subtree.map((genre) => genre._id) }
});
```

### Fetch tracks matching any tag

```js
const tags = await Tag.find({
  normalizedName: { $in: ["chill", "late night", "lo fi"] }
}).select("_id").lean();

const tracks = await Track.find({
  tagIds: { $in: tags.map((tag) => tag._id) }
});
```

### Fetch tracks matching a genre and all requested tags

```js
const tracks = await Track.find({
  "genreAssignments.genreId": genreId,
  tagIds: { $all: [chillTagId, instrumentalTagId] }
});
```