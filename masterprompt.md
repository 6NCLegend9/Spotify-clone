# THE ULTIMATE WAVETUNES MASTER PROMPT (5000+ LINES SYSTEM ARCHITECTURE)

## AI INSTRUCTIONS (META-PROMPT)

**Role:** You are an elite, Principal AI Software Architect and Staff Engineer with deep expertise in high-throughput audio/video streaming, distributed systems, React/Next.js UI/UX design, and complex state machines.
**Objective:** You are receiving a comprehensive, exhaustive specification document (the "Master Spec"). Your task is to ingest this spec and help me build the application exactly as described, phase by phase, file by file.
**Rules of Engagement:**
1. Do NOT attempt to build the entire app at once. We will go phase by phase.
2. Read the entire specification for context.
3. Write production-ready, highly modular, strictly typed TypeScript code.
4. Assume nothing. If a detail is missing, refer to the overarching Spotify/Apple Music design philosophy.
5. All UI must be dark-mode first, heavily utilizing glassmorphism, responsive to the pixel, with mobile looking like a native iOS app.


## PHASE 1: DATABASE SCHEMA (PRISMA)
```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
generator client {
  provider = "prisma-client-js"
}

model User {
  id String @id @default(uuid())
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  email String @unique
  name String?
  avatarUrl String?
  role String @default("LISTENER") // LISTENER, ARTIST, ADMIN
  settings UserSetting?
  playlists Playlist[]
  history ListeningHistory[]
  likedTracks LikedTrack[]
  devices Device[]
}

model Account {
  id String @id @default(uuid())
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  field1 String? // Placeholder for detailed Account property 1
  field2 String? // Placeholder for detailed Account property 2
  field3 String? // Placeholder for detailed Account property 3
  field4 String? // Placeholder for detailed Account property 4
  field5 String? // Placeholder for detailed Account property 5
  field6 String? // Placeholder for detailed Account property 6
  field7 String? // Placeholder for detailed Account property 7
  field8 String? // Placeholder for detailed Account property 8
  field9 String? // Placeholder for detailed Account property 9
  field10 String? // Placeholder for detailed Account property 10
  field11 String? // Placeholder for detailed Account property 11
  field12 String? // Placeholder for detailed Account property 12
  field13 String? // Placeholder for detailed Account property 13
  field14 String? // Placeholder for detailed Account property 14
  field15 String? // Placeholder for detailed Account property 15
  status String @default("ACTIVE")
  metadata Json?
}

model Session {
  id String @id @default(uuid())
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  field1 String? // Placeholder for detailed Session property 1
  field2 String? // Placeholder for detailed Session property 2
  field3 String? // Placeholder for detailed Session property 3
  field4 String? // Placeholder for detailed Session property 4
  field5 String? // Placeholder for detailed Session property 5
  field6 String? // Placeholder for detailed Session property 6
  field7 String? // Placeholder for detailed Session property 7
  field8 String? // Placeholder for detailed Session property 8
  field9 String? // Placeholder for detailed Session property 9
  field10 String? // Placeholder for detailed Session property 10
  field11 String? // Placeholder for detailed Session property 11
  field12 String? // Placeholder for detailed Session property 12
  field13 String? // Placeholder for detailed Session property 13
  field14 String? // Placeholder for detailed Session property 14
  field15 String? // Placeholder for detailed Session property 15
  status String @default("ACTIVE")
  metadata Json?
}

model VerificationToken {
  id String @id @default(uuid())
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  field1 String? // Placeholder for detailed VerificationToken property 1
  field2 String? // Placeholder for detailed VerificationToken property 2
  field3 String? // Placeholder for detailed VerificationToken property 3
  field4 String? // Placeholder for detailed VerificationToken property 4
  field5 String? // Placeholder for detailed VerificationToken property 5
  field6 String? // Placeholder for detailed VerificationToken property 6
  field7 String? // Placeholder for detailed VerificationToken property 7
  field8 String? // Placeholder for detailed VerificationToken property 8
  field9 String? // Placeholder for detailed VerificationToken property 9
  field10 String? // Placeholder for detailed VerificationToken property 10
  field11 String? // Placeholder for detailed VerificationToken property 11
  field12 String? // Placeholder for detailed VerificationToken property 12
  field13 String? // Placeholder for detailed VerificationToken property 13
  field14 String? // Placeholder for detailed VerificationToken property 14
  field15 String? // Placeholder for detailed VerificationToken property 15
  status String @default("ACTIVE")
  metadata Json?
}

model Artist {
  id String @id @default(uuid())
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  field1 String? // Placeholder for detailed Artist property 1
  field2 String? // Placeholder for detailed Artist property 2
  field3 String? // Placeholder for detailed Artist property 3
  field4 String? // Placeholder for detailed Artist property 4
  field5 String? // Placeholder for detailed Artist property 5
  field6 String? // Placeholder for detailed Artist property 6
  field7 String? // Placeholder for detailed Artist property 7
  field8 String? // Placeholder for detailed Artist property 8
  field9 String? // Placeholder for detailed Artist property 9
  field10 String? // Placeholder for detailed Artist property 10
  field11 String? // Placeholder for detailed Artist property 11
  field12 String? // Placeholder for detailed Artist property 12
  field13 String? // Placeholder for detailed Artist property 13
  field14 String? // Placeholder for detailed Artist property 14
  field15 String? // Placeholder for detailed Artist property 15
  status String @default("ACTIVE")
  metadata Json?
}

model Album {
  id String @id @default(uuid())
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  field1 String? // Placeholder for detailed Album property 1
  field2 String? // Placeholder for detailed Album property 2
  field3 String? // Placeholder for detailed Album property 3
  field4 String? // Placeholder for detailed Album property 4
  field5 String? // Placeholder for detailed Album property 5
  field6 String? // Placeholder for detailed Album property 6
  field7 String? // Placeholder for detailed Album property 7
  field8 String? // Placeholder for detailed Album property 8
  field9 String? // Placeholder for detailed Album property 9
  field10 String? // Placeholder for detailed Album property 10
  field11 String? // Placeholder for detailed Album property 11
  field12 String? // Placeholder for detailed Album property 12
  field13 String? // Placeholder for detailed Album property 13
  field14 String? // Placeholder for detailed Album property 14
  field15 String? // Placeholder for detailed Album property 15
  status String @default("ACTIVE")
  metadata Json?
}

model Track {
  id String @id @default(uuid())
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  title String
  youtubeVideoId String @unique
  durationMs Int
  isExplicit Boolean @default(false)
  audioQuality String @default("HIGH")
  albumId String?
  artistId String
  playCount BigInt @default(0)
  lyrics Lyrics?
  videoMetadata VideoMetadata?
  playlistTracks PlaylistTrack[]
  likedBy LikedTrack[]
  history ListeningHistory[]
}

model Playlist {
  id String @id @default(uuid())
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  field1 String? // Placeholder for detailed Playlist property 1
  field2 String? // Placeholder for detailed Playlist property 2
  field3 String? // Placeholder for detailed Playlist property 3
  field4 String? // Placeholder for detailed Playlist property 4
  field5 String? // Placeholder for detailed Playlist property 5
  field6 String? // Placeholder for detailed Playlist property 6
  field7 String? // Placeholder for detailed Playlist property 7
  field8 String? // Placeholder for detailed Playlist property 8
  field9 String? // Placeholder for detailed Playlist property 9
  field10 String? // Placeholder for detailed Playlist property 10
  field11 String? // Placeholder for detailed Playlist property 11
  field12 String? // Placeholder for detailed Playlist property 12
  field13 String? // Placeholder for detailed Playlist property 13
  field14 String? // Placeholder for detailed Playlist property 14
  field15 String? // Placeholder for detailed Playlist property 15
  status String @default("ACTIVE")
  metadata Json?
}

model PlaylistTrack {
  id String @id @default(uuid())
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  field1 String? // Placeholder for detailed PlaylistTrack property 1
  field2 String? // Placeholder for detailed PlaylistTrack property 2
  field3 String? // Placeholder for detailed PlaylistTrack property 3
  field4 String? // Placeholder for detailed PlaylistTrack property 4
  field5 String? // Placeholder for detailed PlaylistTrack property 5
  field6 String? // Placeholder for detailed PlaylistTrack property 6
  field7 String? // Placeholder for detailed PlaylistTrack property 7
  field8 String? // Placeholder for detailed PlaylistTrack property 8
  field9 String? // Placeholder for detailed PlaylistTrack property 9
  field10 String? // Placeholder for detailed PlaylistTrack property 10
  field11 String? // Placeholder for detailed PlaylistTrack property 11
  field12 String? // Placeholder for detailed PlaylistTrack property 12
  field13 String? // Placeholder for detailed PlaylistTrack property 13
  field14 String? // Placeholder for detailed PlaylistTrack property 14
  field15 String? // Placeholder for detailed PlaylistTrack property 15
  status String @default("ACTIVE")
  metadata Json?
}

model LikedTrack {
  id String @id @default(uuid())
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  field1 String? // Placeholder for detailed LikedTrack property 1
  field2 String? // Placeholder for detailed LikedTrack property 2
  field3 String? // Placeholder for detailed LikedTrack property 3
  field4 String? // Placeholder for detailed LikedTrack property 4
  field5 String? // Placeholder for detailed LikedTrack property 5
  field6 String? // Placeholder for detailed LikedTrack property 6
  field7 String? // Placeholder for detailed LikedTrack property 7
  field8 String? // Placeholder for detailed LikedTrack property 8
  field9 String? // Placeholder for detailed LikedTrack property 9
  field10 String? // Placeholder for detailed LikedTrack property 10
  field11 String? // Placeholder for detailed LikedTrack property 11
  field12 String? // Placeholder for detailed LikedTrack property 12
  field13 String? // Placeholder for detailed LikedTrack property 13
  field14 String? // Placeholder for detailed LikedTrack property 14
  field15 String? // Placeholder for detailed LikedTrack property 15
  status String @default("ACTIVE")
  metadata Json?
}

model ListeningHistory {
  id String @id @default(uuid())
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  field1 String? // Placeholder for detailed ListeningHistory property 1
  field2 String? // Placeholder for detailed ListeningHistory property 2
  field3 String? // Placeholder for detailed ListeningHistory property 3
  field4 String? // Placeholder for detailed ListeningHistory property 4
  field5 String? // Placeholder for detailed ListeningHistory property 5
  field6 String? // Placeholder for detailed ListeningHistory property 6
  field7 String? // Placeholder for detailed ListeningHistory property 7
  field8 String? // Placeholder for detailed ListeningHistory property 8
  field9 String? // Placeholder for detailed ListeningHistory property 9
  field10 String? // Placeholder for detailed ListeningHistory property 10
  field11 String? // Placeholder for detailed ListeningHistory property 11
  field12 String? // Placeholder for detailed ListeningHistory property 12
  field13 String? // Placeholder for detailed ListeningHistory property 13
  field14 String? // Placeholder for detailed ListeningHistory property 14
  field15 String? // Placeholder for detailed ListeningHistory property 15
  status String @default("ACTIVE")
  metadata Json?
}

model FollowedArtist {
  id String @id @default(uuid())
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  field1 String? // Placeholder for detailed FollowedArtist property 1
  field2 String? // Placeholder for detailed FollowedArtist property 2
  field3 String? // Placeholder for detailed FollowedArtist property 3
  field4 String? // Placeholder for detailed FollowedArtist property 4
  field5 String? // Placeholder for detailed FollowedArtist property 5
  field6 String? // Placeholder for detailed FollowedArtist property 6
  field7 String? // Placeholder for detailed FollowedArtist property 7
  field8 String? // Placeholder for detailed FollowedArtist property 8
  field9 String? // Placeholder for detailed FollowedArtist property 9
  field10 String? // Placeholder for detailed FollowedArtist property 10
  field11 String? // Placeholder for detailed FollowedArtist property 11
  field12 String? // Placeholder for detailed FollowedArtist property 12
  field13 String? // Placeholder for detailed FollowedArtist property 13
  field14 String? // Placeholder for detailed FollowedArtist property 14
  field15 String? // Placeholder for detailed FollowedArtist property 15
  status String @default("ACTIVE")
  metadata Json?
}

model UserSetting {
  id String @id @default(uuid())
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  userId String @unique
  streamingQuality String @default("VERY_HIGH")
  downloadQuality String @default("HIGH")
  normalizeVolume Boolean @default(true)
  crossfadeDurationMs Int @default(0)
  gaplessPlayback Boolean @default(true)
  autoplaySimilar Boolean @default(true)
  showCanvas Boolean @default(true)
}

model Subscription {
  id String @id @default(uuid())
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  field1 String? // Placeholder for detailed Subscription property 1
  field2 String? // Placeholder for detailed Subscription property 2
  field3 String? // Placeholder for detailed Subscription property 3
  field4 String? // Placeholder for detailed Subscription property 4
  field5 String? // Placeholder for detailed Subscription property 5
  field6 String? // Placeholder for detailed Subscription property 6
  field7 String? // Placeholder for detailed Subscription property 7
  field8 String? // Placeholder for detailed Subscription property 8
  field9 String? // Placeholder for detailed Subscription property 9
  field10 String? // Placeholder for detailed Subscription property 10
  field11 String? // Placeholder for detailed Subscription property 11
  field12 String? // Placeholder for detailed Subscription property 12
  field13 String? // Placeholder for detailed Subscription property 13
  field14 String? // Placeholder for detailed Subscription property 14
  field15 String? // Placeholder for detailed Subscription property 15
  status String @default("ACTIVE")
  metadata Json?
}

model Payment {
  id String @id @default(uuid())
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  field1 String? // Placeholder for detailed Payment property 1
  field2 String? // Placeholder for detailed Payment property 2
  field3 String? // Placeholder for detailed Payment property 3
  field4 String? // Placeholder for detailed Payment property 4
  field5 String? // Placeholder for detailed Payment property 5
  field6 String? // Placeholder for detailed Payment property 6
  field7 String? // Placeholder for detailed Payment property 7
  field8 String? // Placeholder for detailed Payment property 8
  field9 String? // Placeholder for detailed Payment property 9
  field10 String? // Placeholder for detailed Payment property 10
  field11 String? // Placeholder for detailed Payment property 11
  field12 String? // Placeholder for detailed Payment property 12
  field13 String? // Placeholder for detailed Payment property 13
  field14 String? // Placeholder for detailed Payment property 14
  field15 String? // Placeholder for detailed Payment property 15
  status String @default("ACTIVE")
  metadata Json?
}

model AdCampaign {
  id String @id @default(uuid())
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  field1 String? // Placeholder for detailed AdCampaign property 1
  field2 String? // Placeholder for detailed AdCampaign property 2
  field3 String? // Placeholder for detailed AdCampaign property 3
  field4 String? // Placeholder for detailed AdCampaign property 4
  field5 String? // Placeholder for detailed AdCampaign property 5
  field6 String? // Placeholder for detailed AdCampaign property 6
  field7 String? // Placeholder for detailed AdCampaign property 7
  field8 String? // Placeholder for detailed AdCampaign property 8
  field9 String? // Placeholder for detailed AdCampaign property 9
  field10 String? // Placeholder for detailed AdCampaign property 10
  field11 String? // Placeholder for detailed AdCampaign property 11
  field12 String? // Placeholder for detailed AdCampaign property 12
  field13 String? // Placeholder for detailed AdCampaign property 13
  field14 String? // Placeholder for detailed AdCampaign property 14
  field15 String? // Placeholder for detailed AdCampaign property 15
  status String @default("ACTIVE")
  metadata Json?
}

model AdImpression {
  id String @id @default(uuid())
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  field1 String? // Placeholder for detailed AdImpression property 1
  field2 String? // Placeholder for detailed AdImpression property 2
  field3 String? // Placeholder for detailed AdImpression property 3
  field4 String? // Placeholder for detailed AdImpression property 4
  field5 String? // Placeholder for detailed AdImpression property 5
  field6 String? // Placeholder for detailed AdImpression property 6
  field7 String? // Placeholder for detailed AdImpression property 7
  field8 String? // Placeholder for detailed AdImpression property 8
  field9 String? // Placeholder for detailed AdImpression property 9
  field10 String? // Placeholder for detailed AdImpression property 10
  field11 String? // Placeholder for detailed AdImpression property 11
  field12 String? // Placeholder for detailed AdImpression property 12
  field13 String? // Placeholder for detailed AdImpression property 13
  field14 String? // Placeholder for detailed AdImpression property 14
  field15 String? // Placeholder for detailed AdImpression property 15
  status String @default("ACTIVE")
  metadata Json?
}

model Genre {
  id String @id @default(uuid())
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  field1 String? // Placeholder for detailed Genre property 1
  field2 String? // Placeholder for detailed Genre property 2
  field3 String? // Placeholder for detailed Genre property 3
  field4 String? // Placeholder for detailed Genre property 4
  field5 String? // Placeholder for detailed Genre property 5
  field6 String? // Placeholder for detailed Genre property 6
  field7 String? // Placeholder for detailed Genre property 7
  field8 String? // Placeholder for detailed Genre property 8
  field9 String? // Placeholder for detailed Genre property 9
  field10 String? // Placeholder for detailed Genre property 10
  field11 String? // Placeholder for detailed Genre property 11
  field12 String? // Placeholder for detailed Genre property 12
  field13 String? // Placeholder for detailed Genre property 13
  field14 String? // Placeholder for detailed Genre property 14
  field15 String? // Placeholder for detailed Genre property 15
  status String @default("ACTIVE")
  metadata Json?
}

model Mood {
  id String @id @default(uuid())
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  field1 String? // Placeholder for detailed Mood property 1
  field2 String? // Placeholder for detailed Mood property 2
  field3 String? // Placeholder for detailed Mood property 3
  field4 String? // Placeholder for detailed Mood property 4
  field5 String? // Placeholder for detailed Mood property 5
  field6 String? // Placeholder for detailed Mood property 6
  field7 String? // Placeholder for detailed Mood property 7
  field8 String? // Placeholder for detailed Mood property 8
  field9 String? // Placeholder for detailed Mood property 9
  field10 String? // Placeholder for detailed Mood property 10
  field11 String? // Placeholder for detailed Mood property 11
  field12 String? // Placeholder for detailed Mood property 12
  field13 String? // Placeholder for detailed Mood property 13
  field14 String? // Placeholder for detailed Mood property 14
  field15 String? // Placeholder for detailed Mood property 15
  status String @default("ACTIVE")
  metadata Json?
}

model Podcast {
  id String @id @default(uuid())
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  field1 String? // Placeholder for detailed Podcast property 1
  field2 String? // Placeholder for detailed Podcast property 2
  field3 String? // Placeholder for detailed Podcast property 3
  field4 String? // Placeholder for detailed Podcast property 4
  field5 String? // Placeholder for detailed Podcast property 5
  field6 String? // Placeholder for detailed Podcast property 6
  field7 String? // Placeholder for detailed Podcast property 7
  field8 String? // Placeholder for detailed Podcast property 8
  field9 String? // Placeholder for detailed Podcast property 9
  field10 String? // Placeholder for detailed Podcast property 10
  field11 String? // Placeholder for detailed Podcast property 11
  field12 String? // Placeholder for detailed Podcast property 12
  field13 String? // Placeholder for detailed Podcast property 13
  field14 String? // Placeholder for detailed Podcast property 14
  field15 String? // Placeholder for detailed Podcast property 15
  status String @default("ACTIVE")
  metadata Json?
}

model Episode {
  id String @id @default(uuid())
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  field1 String? // Placeholder for detailed Episode property 1
  field2 String? // Placeholder for detailed Episode property 2
  field3 String? // Placeholder for detailed Episode property 3
  field4 String? // Placeholder for detailed Episode property 4
  field5 String? // Placeholder for detailed Episode property 5
  field6 String? // Placeholder for detailed Episode property 6
  field7 String? // Placeholder for detailed Episode property 7
  field8 String? // Placeholder for detailed Episode property 8
  field9 String? // Placeholder for detailed Episode property 9
  field10 String? // Placeholder for detailed Episode property 10
  field11 String? // Placeholder for detailed Episode property 11
  field12 String? // Placeholder for detailed Episode property 12
  field13 String? // Placeholder for detailed Episode property 13
  field14 String? // Placeholder for detailed Episode property 14
  field15 String? // Placeholder for detailed Episode property 15
  status String @default("ACTIVE")
  metadata Json?
}

model VideoMetadata {
  id String @id @default(uuid())
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  field1 String? // Placeholder for detailed VideoMetadata property 1
  field2 String? // Placeholder for detailed VideoMetadata property 2
  field3 String? // Placeholder for detailed VideoMetadata property 3
  field4 String? // Placeholder for detailed VideoMetadata property 4
  field5 String? // Placeholder for detailed VideoMetadata property 5
  field6 String? // Placeholder for detailed VideoMetadata property 6
  field7 String? // Placeholder for detailed VideoMetadata property 7
  field8 String? // Placeholder for detailed VideoMetadata property 8
  field9 String? // Placeholder for detailed VideoMetadata property 9
  field10 String? // Placeholder for detailed VideoMetadata property 10
  field11 String? // Placeholder for detailed VideoMetadata property 11
  field12 String? // Placeholder for detailed VideoMetadata property 12
  field13 String? // Placeholder for detailed VideoMetadata property 13
  field14 String? // Placeholder for detailed VideoMetadata property 14
  field15 String? // Placeholder for detailed VideoMetadata property 15
  status String @default("ACTIVE")
  metadata Json?
}

model Lyrics {
  id String @id @default(uuid())
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  field1 String? // Placeholder for detailed Lyrics property 1
  field2 String? // Placeholder for detailed Lyrics property 2
  field3 String? // Placeholder for detailed Lyrics property 3
  field4 String? // Placeholder for detailed Lyrics property 4
  field5 String? // Placeholder for detailed Lyrics property 5
  field6 String? // Placeholder for detailed Lyrics property 6
  field7 String? // Placeholder for detailed Lyrics property 7
  field8 String? // Placeholder for detailed Lyrics property 8
  field9 String? // Placeholder for detailed Lyrics property 9
  field10 String? // Placeholder for detailed Lyrics property 10
  field11 String? // Placeholder for detailed Lyrics property 11
  field12 String? // Placeholder for detailed Lyrics property 12
  field13 String? // Placeholder for detailed Lyrics property 13
  field14 String? // Placeholder for detailed Lyrics property 14
  field15 String? // Placeholder for detailed Lyrics property 15
  status String @default("ACTIVE")
  metadata Json?
}

model CollaborativeSession {
  id String @id @default(uuid())
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  field1 String? // Placeholder for detailed CollaborativeSession property 1
  field2 String? // Placeholder for detailed CollaborativeSession property 2
  field3 String? // Placeholder for detailed CollaborativeSession property 3
  field4 String? // Placeholder for detailed CollaborativeSession property 4
  field5 String? // Placeholder for detailed CollaborativeSession property 5
  field6 String? // Placeholder for detailed CollaborativeSession property 6
  field7 String? // Placeholder for detailed CollaborativeSession property 7
  field8 String? // Placeholder for detailed CollaborativeSession property 8
  field9 String? // Placeholder for detailed CollaborativeSession property 9
  field10 String? // Placeholder for detailed CollaborativeSession property 10
  field11 String? // Placeholder for detailed CollaborativeSession property 11
  field12 String? // Placeholder for detailed CollaborativeSession property 12
  field13 String? // Placeholder for detailed CollaborativeSession property 13
  field14 String? // Placeholder for detailed CollaborativeSession property 14
  field15 String? // Placeholder for detailed CollaborativeSession property 15
  status String @default("ACTIVE")
  metadata Json?
}

model Device {
  id String @id @default(uuid())
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  field1 String? // Placeholder for detailed Device property 1
  field2 String? // Placeholder for detailed Device property 2
  field3 String? // Placeholder for detailed Device property 3
  field4 String? // Placeholder for detailed Device property 4
  field5 String? // Placeholder for detailed Device property 5
  field6 String? // Placeholder for detailed Device property 6
  field7 String? // Placeholder for detailed Device property 7
  field8 String? // Placeholder for detailed Device property 8
  field9 String? // Placeholder for detailed Device property 9
  field10 String? // Placeholder for detailed Device property 10
  field11 String? // Placeholder for detailed Device property 11
  field12 String? // Placeholder for detailed Device property 12
  field13 String? // Placeholder for detailed Device property 13
  field14 String? // Placeholder for detailed Device property 14
  field15 String? // Placeholder for detailed Device property 15
  status String @default("ACTIVE")
  metadata Json?
}

model DownloadCache {
  id String @id @default(uuid())
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  field1 String? // Placeholder for detailed DownloadCache property 1
  field2 String? // Placeholder for detailed DownloadCache property 2
  field3 String? // Placeholder for detailed DownloadCache property 3
  field4 String? // Placeholder for detailed DownloadCache property 4
  field5 String? // Placeholder for detailed DownloadCache property 5
  field6 String? // Placeholder for detailed DownloadCache property 6
  field7 String? // Placeholder for detailed DownloadCache property 7
  field8 String? // Placeholder for detailed DownloadCache property 8
  field9 String? // Placeholder for detailed DownloadCache property 9
  field10 String? // Placeholder for detailed DownloadCache property 10
  field11 String? // Placeholder for detailed DownloadCache property 11
  field12 String? // Placeholder for detailed DownloadCache property 12
  field13 String? // Placeholder for detailed DownloadCache property 13
  field14 String? // Placeholder for detailed DownloadCache property 14
  field15 String? // Placeholder for detailed DownloadCache property 15
  status String @default("ACTIVE")
  metadata Json?
}

model Notification {
  id String @id @default(uuid())
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  field1 String? // Placeholder for detailed Notification property 1
  field2 String? // Placeholder for detailed Notification property 2
  field3 String? // Placeholder for detailed Notification property 3
  field4 String? // Placeholder for detailed Notification property 4
  field5 String? // Placeholder for detailed Notification property 5
  field6 String? // Placeholder for detailed Notification property 6
  field7 String? // Placeholder for detailed Notification property 7
  field8 String? // Placeholder for detailed Notification property 8
  field9 String? // Placeholder for detailed Notification property 9
  field10 String? // Placeholder for detailed Notification property 10
  field11 String? // Placeholder for detailed Notification property 11
  field12 String? // Placeholder for detailed Notification property 12
  field13 String? // Placeholder for detailed Notification property 13
  field14 String? // Placeholder for detailed Notification property 14
  field15 String? // Placeholder for detailed Notification property 15
  status String @default("ACTIVE")
  metadata Json?
}

model FriendActivity {
  id String @id @default(uuid())
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  field1 String? // Placeholder for detailed FriendActivity property 1
  field2 String? // Placeholder for detailed FriendActivity property 2
  field3 String? // Placeholder for detailed FriendActivity property 3
  field4 String? // Placeholder for detailed FriendActivity property 4
  field5 String? // Placeholder for detailed FriendActivity property 5
  field6 String? // Placeholder for detailed FriendActivity property 6
  field7 String? // Placeholder for detailed FriendActivity property 7
  field8 String? // Placeholder for detailed FriendActivity property 8
  field9 String? // Placeholder for detailed FriendActivity property 9
  field10 String? // Placeholder for detailed FriendActivity property 10
  field11 String? // Placeholder for detailed FriendActivity property 11
  field12 String? // Placeholder for detailed FriendActivity property 12
  field13 String? // Placeholder for detailed FriendActivity property 13
  field14 String? // Placeholder for detailed FriendActivity property 14
  field15 String? // Placeholder for detailed FriendActivity property 15
  status String @default("ACTIVE")
  metadata Json?
}
```

## PHASE 2: API ROUTE CONTRACTS
We require Next.js API routes (App Router). Below are the required endpoints and their payload contracts.

### GET /api/v1/tracks/:id
**Description:** Fetch track metadata
**Request Headers:** `Authorization: Bearer <token>`, `X-Device-ID: <uuid>`
**Response (200 OK):**
```json
{ "status": "success", "data": { ... }, "meta": { "latency": "12ms" } }
```
**Error Handling (4XX/5XX):** Must implement standard RFC 7807 problem details.

### POST /api/v1/tracks/:id/play
**Description:** Log a play for royalty/analytics
**Request Headers:** `Authorization: Bearer <token>`, `X-Device-ID: <uuid>`
**Request Body (JSON):**
```json
{ "context": "device_info", "payload": { "key": "value" } }
```
**Response (200 OK):**
```json
{ "status": "success", "data": { ... }, "meta": { "latency": "12ms" } }
```
**Error Handling (4XX/5XX):** Must implement standard RFC 7807 problem details.

### GET /api/v1/search
**Description:** Global search (tracks, artists, albums)
**Request Headers:** `Authorization: Bearer <token>`, `X-Device-ID: <uuid>`
**Response (200 OK):**
```json
{ "status": "success", "data": { ... }, "meta": { "latency": "12ms" } }
```
**Error Handling (4XX/5XX):** Must implement standard RFC 7807 problem details.

### POST /api/v1/playlists
**Description:** Create a new playlist
**Request Headers:** `Authorization: Bearer <token>`, `X-Device-ID: <uuid>`
**Request Body (JSON):**
```json
{ "context": "device_info", "payload": { "key": "value" } }
```
**Response (200 OK):**
```json
{ "status": "success", "data": { ... }, "meta": { "latency": "12ms" } }
```
**Error Handling (4XX/5XX):** Must implement standard RFC 7807 problem details.

### PUT /api/v1/playlists/:id/tracks
**Description:** Update playlist track order (CRDT)
**Request Headers:** `Authorization: Bearer <token>`, `X-Device-ID: <uuid>`
**Request Body (JSON):**
```json
{ "context": "device_info", "payload": { "key": "value" } }
```
**Response (200 OK):**
```json
{ "status": "success", "data": { ... }, "meta": { "latency": "12ms" } }
```
**Error Handling (4XX/5XX):** Must implement standard RFC 7807 problem details.

### GET /api/v1/me/library
**Description:** Fetch user library sync state
**Request Headers:** `Authorization: Bearer <token>`, `X-Device-ID: <uuid>`
**Response (200 OK):**
```json
{ "status": "success", "data": { ... }, "meta": { "latency": "12ms" } }
```
**Error Handling (4XX/5XX):** Must implement standard RFC 7807 problem details.

### POST /api/v1/engine/resolve-stream
**Description:** Resolve YouTube ID to highest quality audio stream
**Request Headers:** `Authorization: Bearer <token>`, `X-Device-ID: <uuid>`
**Request Body (JSON):**
```json
{ "context": "device_info", "payload": { "key": "value" } }
```
**Response (200 OK):**
```json
{ "status": "success", "data": { ... }, "meta": { "latency": "12ms" } }
```
**Error Handling (4XX/5XX):** Must implement standard RFC 7807 problem details.

### WS /api/v1/social/listen-along
**Description:** WebSocket upgrade for real-time group listening
**Request Headers:** `Authorization: Bearer <token>`, `X-Device-ID: <uuid>`
**Response (200 OK):**
```json
{ "status": "success", "data": { ... }, "meta": { "latency": "12ms" } }
```
**Error Handling (4XX/5XX):** Must implement standard RFC 7807 problem details.

### GET /api/v1/tracks/:id
**Description:** Fetch track metadata
**Request Headers:** `Authorization: Bearer <token>`, `X-Device-ID: <uuid>`
**Response (200 OK):**
```json
{ "status": "success", "data": { ... }, "meta": { "latency": "12ms" } }
```
**Error Handling (4XX/5XX):** Must implement standard RFC 7807 problem details.

### POST /api/v1/tracks/:id/play
**Description:** Log a play for royalty/analytics
**Request Headers:** `Authorization: Bearer <token>`, `X-Device-ID: <uuid>`
**Request Body (JSON):**
```json
{ "context": "device_info", "payload": { "key": "value" } }
```
**Response (200 OK):**
```json
{ "status": "success", "data": { ... }, "meta": { "latency": "12ms" } }
```
**Error Handling (4XX/5XX):** Must implement standard RFC 7807 problem details.

### GET /api/v1/search
**Description:** Global search (tracks, artists, albums)
**Request Headers:** `Authorization: Bearer <token>`, `X-Device-ID: <uuid>`
**Response (200 OK):**
```json
{ "status": "success", "data": { ... }, "meta": { "latency": "12ms" } }
```
**Error Handling (4XX/5XX):** Must implement standard RFC 7807 problem details.

### POST /api/v1/playlists
**Description:** Create a new playlist
**Request Headers:** `Authorization: Bearer <token>`, `X-Device-ID: <uuid>`
**Request Body (JSON):**
```json
{ "context": "device_info", "payload": { "key": "value" } }
```
**Response (200 OK):**
```json
{ "status": "success", "data": { ... }, "meta": { "latency": "12ms" } }
```
**Error Handling (4XX/5XX):** Must implement standard RFC 7807 problem details.

### PUT /api/v1/playlists/:id/tracks
**Description:** Update playlist track order (CRDT)
**Request Headers:** `Authorization: Bearer <token>`, `X-Device-ID: <uuid>`
**Request Body (JSON):**
```json
{ "context": "device_info", "payload": { "key": "value" } }
```
**Response (200 OK):**
```json
{ "status": "success", "data": { ... }, "meta": { "latency": "12ms" } }
```
**Error Handling (4XX/5XX):** Must implement standard RFC 7807 problem details.

### GET /api/v1/me/library
**Description:** Fetch user library sync state
**Request Headers:** `Authorization: Bearer <token>`, `X-Device-ID: <uuid>`
**Response (200 OK):**
```json
{ "status": "success", "data": { ... }, "meta": { "latency": "12ms" } }
```
**Error Handling (4XX/5XX):** Must implement standard RFC 7807 problem details.

### POST /api/v1/engine/resolve-stream
**Description:** Resolve YouTube ID to highest quality audio stream
**Request Headers:** `Authorization: Bearer <token>`, `X-Device-ID: <uuid>`
**Request Body (JSON):**
```json
{ "context": "device_info", "payload": { "key": "value" } }
```
**Response (200 OK):**
```json
{ "status": "success", "data": { ... }, "meta": { "latency": "12ms" } }
```
**Error Handling (4XX/5XX):** Must implement standard RFC 7807 problem details.

### WS /api/v1/social/listen-along
**Description:** WebSocket upgrade for real-time group listening
**Request Headers:** `Authorization: Bearer <token>`, `X-Device-ID: <uuid>`
**Response (200 OK):**
```json
{ "status": "success", "data": { ... }, "meta": { "latency": "12ms" } }
```
**Error Handling (4XX/5XX):** Must implement standard RFC 7807 problem details.

### GET /api/v1/tracks/:id
**Description:** Fetch track metadata
**Request Headers:** `Authorization: Bearer <token>`, `X-Device-ID: <uuid>`
**Response (200 OK):**
```json
{ "status": "success", "data": { ... }, "meta": { "latency": "12ms" } }
```
**Error Handling (4XX/5XX):** Must implement standard RFC 7807 problem details.

### POST /api/v1/tracks/:id/play
**Description:** Log a play for royalty/analytics
**Request Headers:** `Authorization: Bearer <token>`, `X-Device-ID: <uuid>`
**Request Body (JSON):**
```json
{ "context": "device_info", "payload": { "key": "value" } }
```
**Response (200 OK):**
```json
{ "status": "success", "data": { ... }, "meta": { "latency": "12ms" } }
```
**Error Handling (4XX/5XX):** Must implement standard RFC 7807 problem details.

### GET /api/v1/search
**Description:** Global search (tracks, artists, albums)
**Request Headers:** `Authorization: Bearer <token>`, `X-Device-ID: <uuid>`
**Response (200 OK):**
```json
{ "status": "success", "data": { ... }, "meta": { "latency": "12ms" } }
```
**Error Handling (4XX/5XX):** Must implement standard RFC 7807 problem details.

### POST /api/v1/playlists
**Description:** Create a new playlist
**Request Headers:** `Authorization: Bearer <token>`, `X-Device-ID: <uuid>`
**Request Body (JSON):**
```json
{ "context": "device_info", "payload": { "key": "value" } }
```
**Response (200 OK):**
```json
{ "status": "success", "data": { ... }, "meta": { "latency": "12ms" } }
```
**Error Handling (4XX/5XX):** Must implement standard RFC 7807 problem details.

### PUT /api/v1/playlists/:id/tracks
**Description:** Update playlist track order (CRDT)
**Request Headers:** `Authorization: Bearer <token>`, `X-Device-ID: <uuid>`
**Request Body (JSON):**
```json
{ "context": "device_info", "payload": { "key": "value" } }
```
**Response (200 OK):**
```json
{ "status": "success", "data": { ... }, "meta": { "latency": "12ms" } }
```
**Error Handling (4XX/5XX):** Must implement standard RFC 7807 problem details.

### GET /api/v1/me/library
**Description:** Fetch user library sync state
**Request Headers:** `Authorization: Bearer <token>`, `X-Device-ID: <uuid>`
**Response (200 OK):**
```json
{ "status": "success", "data": { ... }, "meta": { "latency": "12ms" } }
```
**Error Handling (4XX/5XX):** Must implement standard RFC 7807 problem details.

### POST /api/v1/engine/resolve-stream
**Description:** Resolve YouTube ID to highest quality audio stream
**Request Headers:** `Authorization: Bearer <token>`, `X-Device-ID: <uuid>`
**Request Body (JSON):**
```json
{ "context": "device_info", "payload": { "key": "value" } }
```
**Response (200 OK):**
```json
{ "status": "success", "data": { ... }, "meta": { "latency": "12ms" } }
```
**Error Handling (4XX/5XX):** Must implement standard RFC 7807 problem details.

### WS /api/v1/social/listen-along
**Description:** WebSocket upgrade for real-time group listening
**Request Headers:** `Authorization: Bearer <token>`, `X-Device-ID: <uuid>`
**Response (200 OK):**
```json
{ "status": "success", "data": { ... }, "meta": { "latency": "12ms" } }
```
**Error Handling (4XX/5XX):** Must implement standard RFC 7807 problem details.

### GET /api/v1/tracks/:id
**Description:** Fetch track metadata
**Request Headers:** `Authorization: Bearer <token>`, `X-Device-ID: <uuid>`
**Response (200 OK):**
```json
{ "status": "success", "data": { ... }, "meta": { "latency": "12ms" } }
```
**Error Handling (4XX/5XX):** Must implement standard RFC 7807 problem details.

### POST /api/v1/tracks/:id/play
**Description:** Log a play for royalty/analytics
**Request Headers:** `Authorization: Bearer <token>`, `X-Device-ID: <uuid>`
**Request Body (JSON):**
```json
{ "context": "device_info", "payload": { "key": "value" } }
```
**Response (200 OK):**
```json
{ "status": "success", "data": { ... }, "meta": { "latency": "12ms" } }
```
**Error Handling (4XX/5XX):** Must implement standard RFC 7807 problem details.

### GET /api/v1/search
**Description:** Global search (tracks, artists, albums)
**Request Headers:** `Authorization: Bearer <token>`, `X-Device-ID: <uuid>`
**Response (200 OK):**
```json
{ "status": "success", "data": { ... }, "meta": { "latency": "12ms" } }
```
**Error Handling (4XX/5XX):** Must implement standard RFC 7807 problem details.

### POST /api/v1/playlists
**Description:** Create a new playlist
**Request Headers:** `Authorization: Bearer <token>`, `X-Device-ID: <uuid>`
**Request Body (JSON):**
```json
{ "context": "device_info", "payload": { "key": "value" } }
```
**Response (200 OK):**
```json
{ "status": "success", "data": { ... }, "meta": { "latency": "12ms" } }
```
**Error Handling (4XX/5XX):** Must implement standard RFC 7807 problem details.

### PUT /api/v1/playlists/:id/tracks
**Description:** Update playlist track order (CRDT)
**Request Headers:** `Authorization: Bearer <token>`, `X-Device-ID: <uuid>`
**Request Body (JSON):**
```json
{ "context": "device_info", "payload": { "key": "value" } }
```
**Response (200 OK):**
```json
{ "status": "success", "data": { ... }, "meta": { "latency": "12ms" } }
```
**Error Handling (4XX/5XX):** Must implement standard RFC 7807 problem details.

### GET /api/v1/me/library
**Description:** Fetch user library sync state
**Request Headers:** `Authorization: Bearer <token>`, `X-Device-ID: <uuid>`
**Response (200 OK):**
```json
{ "status": "success", "data": { ... }, "meta": { "latency": "12ms" } }
```
**Error Handling (4XX/5XX):** Must implement standard RFC 7807 problem details.

### POST /api/v1/engine/resolve-stream
**Description:** Resolve YouTube ID to highest quality audio stream
**Request Headers:** `Authorization: Bearer <token>`, `X-Device-ID: <uuid>`
**Request Body (JSON):**
```json
{ "context": "device_info", "payload": { "key": "value" } }
```
**Response (200 OK):**
```json
{ "status": "success", "data": { ... }, "meta": { "latency": "12ms" } }
```
**Error Handling (4XX/5XX):** Must implement standard RFC 7807 problem details.

### WS /api/v1/social/listen-along
**Description:** WebSocket upgrade for real-time group listening
**Request Headers:** `Authorization: Bearer <token>`, `X-Device-ID: <uuid>`
**Response (200 OK):**
```json
{ "status": "success", "data": { ... }, "meta": { "latency": "12ms" } }
```
**Error Handling (4XX/5XX):** Must implement standard RFC 7807 problem details.

### GET /api/v1/tracks/:id
**Description:** Fetch track metadata
**Request Headers:** `Authorization: Bearer <token>`, `X-Device-ID: <uuid>`
**Response (200 OK):**
```json
{ "status": "success", "data": { ... }, "meta": { "latency": "12ms" } }
```
**Error Handling (4XX/5XX):** Must implement standard RFC 7807 problem details.

### POST /api/v1/tracks/:id/play
**Description:** Log a play for royalty/analytics
**Request Headers:** `Authorization: Bearer <token>`, `X-Device-ID: <uuid>`
**Request Body (JSON):**
```json
{ "context": "device_info", "payload": { "key": "value" } }
```
**Response (200 OK):**
```json
{ "status": "success", "data": { ... }, "meta": { "latency": "12ms" } }
```
**Error Handling (4XX/5XX):** Must implement standard RFC 7807 problem details.

### GET /api/v1/search
**Description:** Global search (tracks, artists, albums)
**Request Headers:** `Authorization: Bearer <token>`, `X-Device-ID: <uuid>`
**Response (200 OK):**
```json
{ "status": "success", "data": { ... }, "meta": { "latency": "12ms" } }
```
**Error Handling (4XX/5XX):** Must implement standard RFC 7807 problem details.

### POST /api/v1/playlists
**Description:** Create a new playlist
**Request Headers:** `Authorization: Bearer <token>`, `X-Device-ID: <uuid>`
**Request Body (JSON):**
```json
{ "context": "device_info", "payload": { "key": "value" } }
```
**Response (200 OK):**
```json
{ "status": "success", "data": { ... }, "meta": { "latency": "12ms" } }
```
**Error Handling (4XX/5XX):** Must implement standard RFC 7807 problem details.

### PUT /api/v1/playlists/:id/tracks
**Description:** Update playlist track order (CRDT)
**Request Headers:** `Authorization: Bearer <token>`, `X-Device-ID: <uuid>`
**Request Body (JSON):**
```json
{ "context": "device_info", "payload": { "key": "value" } }
```
**Response (200 OK):**
```json
{ "status": "success", "data": { ... }, "meta": { "latency": "12ms" } }
```
**Error Handling (4XX/5XX):** Must implement standard RFC 7807 problem details.

### GET /api/v1/me/library
**Description:** Fetch user library sync state
**Request Headers:** `Authorization: Bearer <token>`, `X-Device-ID: <uuid>`
**Response (200 OK):**
```json
{ "status": "success", "data": { ... }, "meta": { "latency": "12ms" } }
```
**Error Handling (4XX/5XX):** Must implement standard RFC 7807 problem details.

### POST /api/v1/engine/resolve-stream
**Description:** Resolve YouTube ID to highest quality audio stream
**Request Headers:** `Authorization: Bearer <token>`, `X-Device-ID: <uuid>`
**Request Body (JSON):**
```json
{ "context": "device_info", "payload": { "key": "value" } }
```
**Response (200 OK):**
```json
{ "status": "success", "data": { ... }, "meta": { "latency": "12ms" } }
```
**Error Handling (4XX/5XX):** Must implement standard RFC 7807 problem details.

### WS /api/v1/social/listen-along
**Description:** WebSocket upgrade for real-time group listening
**Request Headers:** `Authorization: Bearer <token>`, `X-Device-ID: <uuid>`
**Response (200 OK):**
```json
{ "status": "success", "data": { ... }, "meta": { "latency": "12ms" } }
```
**Error Handling (4XX/5XX):** Must implement standard RFC 7807 problem details.

### GET /api/v1/tracks/:id
**Description:** Fetch track metadata
**Request Headers:** `Authorization: Bearer <token>`, `X-Device-ID: <uuid>`
**Response (200 OK):**
```json
{ "status": "success", "data": { ... }, "meta": { "latency": "12ms" } }
```
**Error Handling (4XX/5XX):** Must implement standard RFC 7807 problem details.

### POST /api/v1/tracks/:id/play
**Description:** Log a play for royalty/analytics
**Request Headers:** `Authorization: Bearer <token>`, `X-Device-ID: <uuid>`
**Request Body (JSON):**
```json
{ "context": "device_info", "payload": { "key": "value" } }
```
**Response (200 OK):**
```json
{ "status": "success", "data": { ... }, "meta": { "latency": "12ms" } }
```
**Error Handling (4XX/5XX):** Must implement standard RFC 7807 problem details.

### GET /api/v1/search
**Description:** Global search (tracks, artists, albums)
**Request Headers:** `Authorization: Bearer <token>`, `X-Device-ID: <uuid>`
**Response (200 OK):**
```json
{ "status": "success", "data": { ... }, "meta": { "latency": "12ms" } }
```
**Error Handling (4XX/5XX):** Must implement standard RFC 7807 problem details.

### POST /api/v1/playlists
**Description:** Create a new playlist
**Request Headers:** `Authorization: Bearer <token>`, `X-Device-ID: <uuid>`
**Request Body (JSON):**
```json
{ "context": "device_info", "payload": { "key": "value" } }
```
**Response (200 OK):**
```json
{ "status": "success", "data": { ... }, "meta": { "latency": "12ms" } }
```
**Error Handling (4XX/5XX):** Must implement standard RFC 7807 problem details.

### PUT /api/v1/playlists/:id/tracks
**Description:** Update playlist track order (CRDT)
**Request Headers:** `Authorization: Bearer <token>`, `X-Device-ID: <uuid>`
**Request Body (JSON):**
```json
{ "context": "device_info", "payload": { "key": "value" } }
```
**Response (200 OK):**
```json
{ "status": "success", "data": { ... }, "meta": { "latency": "12ms" } }
```
**Error Handling (4XX/5XX):** Must implement standard RFC 7807 problem details.

### GET /api/v1/me/library
**Description:** Fetch user library sync state
**Request Headers:** `Authorization: Bearer <token>`, `X-Device-ID: <uuid>`
**Response (200 OK):**
```json
{ "status": "success", "data": { ... }, "meta": { "latency": "12ms" } }
```
**Error Handling (4XX/5XX):** Must implement standard RFC 7807 problem details.

### POST /api/v1/engine/resolve-stream
**Description:** Resolve YouTube ID to highest quality audio stream
**Request Headers:** `Authorization: Bearer <token>`, `X-Device-ID: <uuid>`
**Request Body (JSON):**
```json
{ "context": "device_info", "payload": { "key": "value" } }
```
**Response (200 OK):**
```json
{ "status": "success", "data": { ... }, "meta": { "latency": "12ms" } }
```
**Error Handling (4XX/5XX):** Must implement standard RFC 7807 problem details.

### WS /api/v1/social/listen-along
**Description:** WebSocket upgrade for real-time group listening
**Request Headers:** `Authorization: Bearer <token>`, `X-Device-ID: <uuid>`
**Response (200 OK):**
```json
{ "status": "success", "data": { ... }, "meta": { "latency": "12ms" } }
```
**Error Handling (4XX/5XX):** Must implement standard RFC 7807 problem details.

### GET /api/v1/tracks/:id
**Description:** Fetch track metadata
**Request Headers:** `Authorization: Bearer <token>`, `X-Device-ID: <uuid>`
**Response (200 OK):**
```json
{ "status": "success", "data": { ... }, "meta": { "latency": "12ms" } }
```
**Error Handling (4XX/5XX):** Must implement standard RFC 7807 problem details.

### POST /api/v1/tracks/:id/play
**Description:** Log a play for royalty/analytics
**Request Headers:** `Authorization: Bearer <token>`, `X-Device-ID: <uuid>`
**Request Body (JSON):**
```json
{ "context": "device_info", "payload": { "key": "value" } }
```
**Response (200 OK):**
```json
{ "status": "success", "data": { ... }, "meta": { "latency": "12ms" } }
```
**Error Handling (4XX/5XX):** Must implement standard RFC 7807 problem details.

### GET /api/v1/search
**Description:** Global search (tracks, artists, albums)
**Request Headers:** `Authorization: Bearer <token>`, `X-Device-ID: <uuid>`
**Response (200 OK):**
```json
{ "status": "success", "data": { ... }, "meta": { "latency": "12ms" } }
```
**Error Handling (4XX/5XX):** Must implement standard RFC 7807 problem details.

### POST /api/v1/playlists
**Description:** Create a new playlist
**Request Headers:** `Authorization: Bearer <token>`, `X-Device-ID: <uuid>`
**Request Body (JSON):**
```json
{ "context": "device_info", "payload": { "key": "value" } }
```
**Response (200 OK):**
```json
{ "status": "success", "data": { ... }, "meta": { "latency": "12ms" } }
```
**Error Handling (4XX/5XX):** Must implement standard RFC 7807 problem details.

### PUT /api/v1/playlists/:id/tracks
**Description:** Update playlist track order (CRDT)
**Request Headers:** `Authorization: Bearer <token>`, `X-Device-ID: <uuid>`
**Request Body (JSON):**
```json
{ "context": "device_info", "payload": { "key": "value" } }
```
**Response (200 OK):**
```json
{ "status": "success", "data": { ... }, "meta": { "latency": "12ms" } }
```
**Error Handling (4XX/5XX):** Must implement standard RFC 7807 problem details.

### GET /api/v1/me/library
**Description:** Fetch user library sync state
**Request Headers:** `Authorization: Bearer <token>`, `X-Device-ID: <uuid>`
**Response (200 OK):**
```json
{ "status": "success", "data": { ... }, "meta": { "latency": "12ms" } }
```
**Error Handling (4XX/5XX):** Must implement standard RFC 7807 problem details.

### POST /api/v1/engine/resolve-stream
**Description:** Resolve YouTube ID to highest quality audio stream
**Request Headers:** `Authorization: Bearer <token>`, `X-Device-ID: <uuid>`
**Request Body (JSON):**
```json
{ "context": "device_info", "payload": { "key": "value" } }
```
**Response (200 OK):**
```json
{ "status": "success", "data": { ... }, "meta": { "latency": "12ms" } }
```
**Error Handling (4XX/5XX):** Must implement standard RFC 7807 problem details.

### WS /api/v1/social/listen-along
**Description:** WebSocket upgrade for real-time group listening
**Request Headers:** `Authorization: Bearer <token>`, `X-Device-ID: <uuid>`
**Response (200 OK):**
```json
{ "status": "success", "data": { ... }, "meta": { "latency": "12ms" } }
```
**Error Handling (4XX/5XX):** Must implement standard RFC 7807 problem details.

### GET /api/v1/tracks/:id
**Description:** Fetch track metadata
**Request Headers:** `Authorization: Bearer <token>`, `X-Device-ID: <uuid>`
**Response (200 OK):**
```json
{ "status": "success", "data": { ... }, "meta": { "latency": "12ms" } }
```
**Error Handling (4XX/5XX):** Must implement standard RFC 7807 problem details.

### POST /api/v1/tracks/:id/play
**Description:** Log a play for royalty/analytics
**Request Headers:** `Authorization: Bearer <token>`, `X-Device-ID: <uuid>`
**Request Body (JSON):**
```json
{ "context": "device_info", "payload": { "key": "value" } }
```
**Response (200 OK):**
```json
{ "status": "success", "data": { ... }, "meta": { "latency": "12ms" } }
```
**Error Handling (4XX/5XX):** Must implement standard RFC 7807 problem details.

### GET /api/v1/search
**Description:** Global search (tracks, artists, albums)
**Request Headers:** `Authorization: Bearer <token>`, `X-Device-ID: <uuid>`
**Response (200 OK):**
```json
{ "status": "success", "data": { ... }, "meta": { "latency": "12ms" } }
```
**Error Handling (4XX/5XX):** Must implement standard RFC 7807 problem details.

### POST /api/v1/playlists
**Description:** Create a new playlist
**Request Headers:** `Authorization: Bearer <token>`, `X-Device-ID: <uuid>`
**Request Body (JSON):**
```json
{ "context": "device_info", "payload": { "key": "value" } }
```
**Response (200 OK):**
```json
{ "status": "success", "data": { ... }, "meta": { "latency": "12ms" } }
```
**Error Handling (4XX/5XX):** Must implement standard RFC 7807 problem details.

### PUT /api/v1/playlists/:id/tracks
**Description:** Update playlist track order (CRDT)
**Request Headers:** `Authorization: Bearer <token>`, `X-Device-ID: <uuid>`
**Request Body (JSON):**
```json
{ "context": "device_info", "payload": { "key": "value" } }
```
**Response (200 OK):**
```json
{ "status": "success", "data": { ... }, "meta": { "latency": "12ms" } }
```
**Error Handling (4XX/5XX):** Must implement standard RFC 7807 problem details.

### GET /api/v1/me/library
**Description:** Fetch user library sync state
**Request Headers:** `Authorization: Bearer <token>`, `X-Device-ID: <uuid>`
**Response (200 OK):**
```json
{ "status": "success", "data": { ... }, "meta": { "latency": "12ms" } }
```
**Error Handling (4XX/5XX):** Must implement standard RFC 7807 problem details.

### POST /api/v1/engine/resolve-stream
**Description:** Resolve YouTube ID to highest quality audio stream
**Request Headers:** `Authorization: Bearer <token>`, `X-Device-ID: <uuid>`
**Request Body (JSON):**
```json
{ "context": "device_info", "payload": { "key": "value" } }
```
**Response (200 OK):**
```json
{ "status": "success", "data": { ... }, "meta": { "latency": "12ms" } }
```
**Error Handling (4XX/5XX):** Must implement standard RFC 7807 problem details.

### WS /api/v1/social/listen-along
**Description:** WebSocket upgrade for real-time group listening
**Request Headers:** `Authorization: Bearer <token>`, `X-Device-ID: <uuid>`
**Response (200 OK):**
```json
{ "status": "success", "data": { ... }, "meta": { "latency": "12ms" } }
```
**Error Handling (4XX/5XX):** Must implement standard RFC 7807 problem details.

### GET /api/v1/tracks/:id
**Description:** Fetch track metadata
**Request Headers:** `Authorization: Bearer <token>`, `X-Device-ID: <uuid>`
**Response (200 OK):**
```json
{ "status": "success", "data": { ... }, "meta": { "latency": "12ms" } }
```
**Error Handling (4XX/5XX):** Must implement standard RFC 7807 problem details.

### POST /api/v1/tracks/:id/play
**Description:** Log a play for royalty/analytics
**Request Headers:** `Authorization: Bearer <token>`, `X-Device-ID: <uuid>`
**Request Body (JSON):**
```json
{ "context": "device_info", "payload": { "key": "value" } }
```
**Response (200 OK):**
```json
{ "status": "success", "data": { ... }, "meta": { "latency": "12ms" } }
```
**Error Handling (4XX/5XX):** Must implement standard RFC 7807 problem details.

### GET /api/v1/search
**Description:** Global search (tracks, artists, albums)
**Request Headers:** `Authorization: Bearer <token>`, `X-Device-ID: <uuid>`
**Response (200 OK):**
```json
{ "status": "success", "data": { ... }, "meta": { "latency": "12ms" } }
```
**Error Handling (4XX/5XX):** Must implement standard RFC 7807 problem details.

### POST /api/v1/playlists
**Description:** Create a new playlist
**Request Headers:** `Authorization: Bearer <token>`, `X-Device-ID: <uuid>`
**Request Body (JSON):**
```json
{ "context": "device_info", "payload": { "key": "value" } }
```
**Response (200 OK):**
```json
{ "status": "success", "data": { ... }, "meta": { "latency": "12ms" } }
```
**Error Handling (4XX/5XX):** Must implement standard RFC 7807 problem details.

### PUT /api/v1/playlists/:id/tracks
**Description:** Update playlist track order (CRDT)
**Request Headers:** `Authorization: Bearer <token>`, `X-Device-ID: <uuid>`
**Request Body (JSON):**
```json
{ "context": "device_info", "payload": { "key": "value" } }
```
**Response (200 OK):**
```json
{ "status": "success", "data": { ... }, "meta": { "latency": "12ms" } }
```
**Error Handling (4XX/5XX):** Must implement standard RFC 7807 problem details.

### GET /api/v1/me/library
**Description:** Fetch user library sync state
**Request Headers:** `Authorization: Bearer <token>`, `X-Device-ID: <uuid>`
**Response (200 OK):**
```json
{ "status": "success", "data": { ... }, "meta": { "latency": "12ms" } }
```
**Error Handling (4XX/5XX):** Must implement standard RFC 7807 problem details.

### POST /api/v1/engine/resolve-stream
**Description:** Resolve YouTube ID to highest quality audio stream
**Request Headers:** `Authorization: Bearer <token>`, `X-Device-ID: <uuid>`
**Request Body (JSON):**
```json
{ "context": "device_info", "payload": { "key": "value" } }
```
**Response (200 OK):**
```json
{ "status": "success", "data": { ... }, "meta": { "latency": "12ms" } }
```
**Error Handling (4XX/5XX):** Must implement standard RFC 7807 problem details.

### WS /api/v1/social/listen-along
**Description:** WebSocket upgrade for real-time group listening
**Request Headers:** `Authorization: Bearer <token>`, `X-Device-ID: <uuid>`
**Response (200 OK):**
```json
{ "status": "success", "data": { ... }, "meta": { "latency": "12ms" } }
```
**Error Handling (4XX/5XX):** Must implement standard RFC 7807 problem details.

### GET /api/v1/tracks/:id
**Description:** Fetch track metadata
**Request Headers:** `Authorization: Bearer <token>`, `X-Device-ID: <uuid>`
**Response (200 OK):**
```json
{ "status": "success", "data": { ... }, "meta": { "latency": "12ms" } }
```
**Error Handling (4XX/5XX):** Must implement standard RFC 7807 problem details.

### POST /api/v1/tracks/:id/play
**Description:** Log a play for royalty/analytics
**Request Headers:** `Authorization: Bearer <token>`, `X-Device-ID: <uuid>`
**Request Body (JSON):**
```json
{ "context": "device_info", "payload": { "key": "value" } }
```
**Response (200 OK):**
```json
{ "status": "success", "data": { ... }, "meta": { "latency": "12ms" } }
```
**Error Handling (4XX/5XX):** Must implement standard RFC 7807 problem details.

### GET /api/v1/search
**Description:** Global search (tracks, artists, albums)
**Request Headers:** `Authorization: Bearer <token>`, `X-Device-ID: <uuid>`
**Response (200 OK):**
```json
{ "status": "success", "data": { ... }, "meta": { "latency": "12ms" } }
```
**Error Handling (4XX/5XX):** Must implement standard RFC 7807 problem details.

### POST /api/v1/playlists
**Description:** Create a new playlist
**Request Headers:** `Authorization: Bearer <token>`, `X-Device-ID: <uuid>`
**Request Body (JSON):**
```json
{ "context": "device_info", "payload": { "key": "value" } }
```
**Response (200 OK):**
```json
{ "status": "success", "data": { ... }, "meta": { "latency": "12ms" } }
```
**Error Handling (4XX/5XX):** Must implement standard RFC 7807 problem details.

### PUT /api/v1/playlists/:id/tracks
**Description:** Update playlist track order (CRDT)
**Request Headers:** `Authorization: Bearer <token>`, `X-Device-ID: <uuid>`
**Request Body (JSON):**
```json
{ "context": "device_info", "payload": { "key": "value" } }
```
**Response (200 OK):**
```json
{ "status": "success", "data": { ... }, "meta": { "latency": "12ms" } }
```
**Error Handling (4XX/5XX):** Must implement standard RFC 7807 problem details.

### GET /api/v1/me/library
**Description:** Fetch user library sync state
**Request Headers:** `Authorization: Bearer <token>`, `X-Device-ID: <uuid>`
**Response (200 OK):**
```json
{ "status": "success", "data": { ... }, "meta": { "latency": "12ms" } }
```
**Error Handling (4XX/5XX):** Must implement standard RFC 7807 problem details.

### POST /api/v1/engine/resolve-stream
**Description:** Resolve YouTube ID to highest quality audio stream
**Request Headers:** `Authorization: Bearer <token>`, `X-Device-ID: <uuid>`
**Request Body (JSON):**
```json
{ "context": "device_info", "payload": { "key": "value" } }
```
**Response (200 OK):**
```json
{ "status": "success", "data": { ... }, "meta": { "latency": "12ms" } }
```
**Error Handling (4XX/5XX):** Must implement standard RFC 7807 problem details.

### WS /api/v1/social/listen-along
**Description:** WebSocket upgrade for real-time group listening
**Request Headers:** `Authorization: Bearer <token>`, `X-Device-ID: <uuid>`
**Response (200 OK):**
```json
{ "status": "success", "data": { ... }, "meta": { "latency": "12ms" } }
```
**Error Handling (4XX/5XX):** Must implement standard RFC 7807 problem details.

## PHASE 3: DUAL-IFRAME AUDIO ENGINE & WEB AUDIO API

The playback engine is the heart of WaveTunes. It must operate independently of React's render cycle to ensure zero latency and prevent stuttering.

**Core Requirements:**
1. **Dual IFrame (or Audio Node) Crossfading:** Instantiation of two hidden players (Player A and Player B). As Player A reaches `duration - crossfadeMs`, Player B begins buffering and fading in volume.
2. **Video Sync Mode:** If `isVideoView == true`, the active player is mounted to the DOM with visible CSS. The secondary player remains hidden.
3. **Volume Normalization:** Analyze the LUFS (Loudness Units relative to Full Scale) if available, and apply a GainNode to the Web Audio context to normalize to -14 LUFS.


### XState Machine Definition (Playback Controller)
```javascript
const playerMachine = createMachine({
  id: 'waveTunesPlayer',
  initial: 'idle',
  context: { currentTrack: null, queue: [], volume: 1.0, crossfade: 3000 },
  states: {
    idle: {
      on: {
        PLAY: 'some_target_state', // Transition logic
        PAUSE: 'some_target_state', // Transition logic
        SEEK: 'some_target_state', // Transition logic
        END: 'some_target_state', // Transition logic
        ERROR: 'some_target_state', // Transition logic
        SKIP: 'some_target_state', // Transition logic
      }
    },
    loading: {
      on: {
        PLAY: 'some_target_state', // Transition logic
        PAUSE: 'some_target_state', // Transition logic
        SEEK: 'some_target_state', // Transition logic
        END: 'some_target_state', // Transition logic
        ERROR: 'some_target_state', // Transition logic
        SKIP: 'some_target_state', // Transition logic
      }
    },
    buffering: {
      on: {
        PLAY: 'some_target_state', // Transition logic
        PAUSE: 'some_target_state', // Transition logic
        SEEK: 'some_target_state', // Transition logic
        END: 'some_target_state', // Transition logic
        ERROR: 'some_target_state', // Transition logic
        SKIP: 'some_target_state', // Transition logic
      }
    },
    playing: {
      on: {
        PLAY: 'some_target_state', // Transition logic
        PAUSE: 'some_target_state', // Transition logic
        SEEK: 'some_target_state', // Transition logic
        END: 'some_target_state', // Transition logic
        ERROR: 'some_target_state', // Transition logic
        SKIP: 'some_target_state', // Transition logic
      }
    },
    paused: {
      on: {
        PLAY: 'some_target_state', // Transition logic
        PAUSE: 'some_target_state', // Transition logic
        SEEK: 'some_target_state', // Transition logic
        END: 'some_target_state', // Transition logic
        ERROR: 'some_target_state', // Transition logic
        SKIP: 'some_target_state', // Transition logic
      }
    },
    seeking: {
      on: {
        PLAY: 'some_target_state', // Transition logic
        PAUSE: 'some_target_state', // Transition logic
        SEEK: 'some_target_state', // Transition logic
        END: 'some_target_state', // Transition logic
        ERROR: 'some_target_state', // Transition logic
        SKIP: 'some_target_state', // Transition logic
      }
    },
    crossfading: {
      on: {
        PLAY: 'some_target_state', // Transition logic
        PAUSE: 'some_target_state', // Transition logic
        SEEK: 'some_target_state', // Transition logic
        END: 'some_target_state', // Transition logic
        ERROR: 'some_target_state', // Transition logic
        SKIP: 'some_target_state', // Transition logic
      }
    },
    error: {
      on: {
        PLAY: 'some_target_state', // Transition logic
        PAUSE: 'some_target_state', // Transition logic
        SEEK: 'some_target_state', // Transition logic
        END: 'some_target_state', // Transition logic
        ERROR: 'some_target_state', // Transition logic
        SKIP: 'some_target_state', // Transition logic
      }
    },
    ended: {
      on: {
        PLAY: 'some_target_state', // Transition logic
        PAUSE: 'some_target_state', // Transition logic
        SEEK: 'some_target_state', // Transition logic
        END: 'some_target_state', // Transition logic
        ERROR: 'some_target_state', // Transition logic
        SKIP: 'some_target_state', // Transition logic
      }
    },
  }
});
```

## PHASE 4: UI/UX COMPONENT LIBRARY (TAILWIND + FRAMER MOTION)
Every component must be strictly typed and styled with Tailwind CSS. Use Framer Motion for micro-interactions.

### Component: `<Sidebar />`
**Props:**
- `id: string` - Unique identifier
- `data: SidebarData` - Core payload
- `isActive: boolean` - Styling toggle
- `onInteraction: (e: React.MouseEvent) => void`
**Styling Requirements:**
- Dark mode default: `bg-slate-900 text-slate-50`
- Glassmorphism: `backdrop-blur-md bg-white/5`
- Hover states: `hover:bg-white/10 transition-colors duration-200`
**Animation (Framer Motion):**
- Initial: `opacity: 0, y: 10`
- Animate: `opacity: 1, y: 0`
- Exit: `opacity: 0, scale: 0.95`

### Component: `<BottomPlayer />`
**Props:**
- `id: string` - Unique identifier
- `data: BottomPlayerData` - Core payload
- `isActive: boolean` - Styling toggle
- `onInteraction: (e: React.MouseEvent) => void`
**Styling Requirements:**
- Dark mode default: `bg-slate-900 text-slate-50`
- Glassmorphism: `backdrop-blur-md bg-white/5`
- Hover states: `hover:bg-white/10 transition-colors duration-200`
**Animation (Framer Motion):**
- Initial: `opacity: 0, y: 10`
- Animate: `opacity: 1, y: 0`
- Exit: `opacity: 0, scale: 0.95`

### Component: `<MobileTabNav />`
**Props:**
- `id: string` - Unique identifier
- `data: MobileTabNavData` - Core payload
- `isActive: boolean` - Styling toggle
- `onInteraction: (e: React.MouseEvent) => void`
**Styling Requirements:**
- Dark mode default: `bg-slate-900 text-slate-50`
- Glassmorphism: `backdrop-blur-md bg-white/5`
- Hover states: `hover:bg-white/10 transition-colors duration-200`
**Animation (Framer Motion):**
- Initial: `opacity: 0, y: 10`
- Animate: `opacity: 1, y: 0`
- Exit: `opacity: 0, scale: 0.95`

### Component: `<TrackRow />`
**Props:**
- `id: string` - Unique identifier
- `data: TrackRowData` - Core payload
- `isActive: boolean` - Styling toggle
- `onInteraction: (e: React.MouseEvent) => void`
**Styling Requirements:**
- Dark mode default: `bg-slate-900 text-slate-50`
- Glassmorphism: `backdrop-blur-md bg-white/5`
- Hover states: `hover:bg-white/10 transition-colors duration-200`
**Animation (Framer Motion):**
- Initial: `opacity: 0, y: 10`
- Animate: `opacity: 1, y: 0`
- Exit: `opacity: 0, scale: 0.95`

### Component: `<AlbumCard />`
**Props:**
- `id: string` - Unique identifier
- `data: AlbumCardData` - Core payload
- `isActive: boolean` - Styling toggle
- `onInteraction: (e: React.MouseEvent) => void`
**Styling Requirements:**
- Dark mode default: `bg-slate-900 text-slate-50`
- Glassmorphism: `backdrop-blur-md bg-white/5`
- Hover states: `hover:bg-white/10 transition-colors duration-200`
**Animation (Framer Motion):**
- Initial: `opacity: 0, y: 10`
- Animate: `opacity: 1, y: 0`
- Exit: `opacity: 0, scale: 0.95`

### Component: `<PlaylistHeader />`
**Props:**
- `id: string` - Unique identifier
- `data: PlaylistHeaderData` - Core payload
- `isActive: boolean` - Styling toggle
- `onInteraction: (e: React.MouseEvent) => void`
**Styling Requirements:**
- Dark mode default: `bg-slate-900 text-slate-50`
- Glassmorphism: `backdrop-blur-md bg-white/5`
- Hover states: `hover:bg-white/10 transition-colors duration-200`
**Animation (Framer Motion):**
- Initial: `opacity: 0, y: 10`
- Animate: `opacity: 1, y: 0`
- Exit: `opacity: 0, scale: 0.95`

### Component: `<QueueList />`
**Props:**
- `id: string` - Unique identifier
- `data: QueueListData` - Core payload
- `isActive: boolean` - Styling toggle
- `onInteraction: (e: React.MouseEvent) => void`
**Styling Requirements:**
- Dark mode default: `bg-slate-900 text-slate-50`
- Glassmorphism: `backdrop-blur-md bg-white/5`
- Hover states: `hover:bg-white/10 transition-colors duration-200`
**Animation (Framer Motion):**
- Initial: `opacity: 0, y: 10`
- Animate: `opacity: 1, y: 0`
- Exit: `opacity: 0, scale: 0.95`

### Component: `<LyricsView />`
**Props:**
- `id: string` - Unique identifier
- `data: LyricsViewData` - Core payload
- `isActive: boolean` - Styling toggle
- `onInteraction: (e: React.MouseEvent) => void`
**Styling Requirements:**
- Dark mode default: `bg-slate-900 text-slate-50`
- Glassmorphism: `backdrop-blur-md bg-white/5`
- Hover states: `hover:bg-white/10 transition-colors duration-200`
**Animation (Framer Motion):**
- Initial: `opacity: 0, y: 10`
- Animate: `opacity: 1, y: 0`
- Exit: `opacity: 0, scale: 0.95`

### Component: `<VideoPlayerOverlay />`
**Props:**
- `id: string` - Unique identifier
- `data: VideoPlayerOverlayData` - Core payload
- `isActive: boolean` - Styling toggle
- `onInteraction: (e: React.MouseEvent) => void`
**Styling Requirements:**
- Dark mode default: `bg-slate-900 text-slate-50`
- Glassmorphism: `backdrop-blur-md bg-white/5`
- Hover states: `hover:bg-white/10 transition-colors duration-200`
**Animation (Framer Motion):**
- Initial: `opacity: 0, y: 10`
- Animate: `opacity: 1, y: 0`
- Exit: `opacity: 0, scale: 0.95`

### Component: `<FriendActivityFeed />`
**Props:**
- `id: string` - Unique identifier
- `data: FriendActivityFeedData` - Core payload
- `isActive: boolean` - Styling toggle
- `onInteraction: (e: React.MouseEvent) => void`
**Styling Requirements:**
- Dark mode default: `bg-slate-900 text-slate-50`
- Glassmorphism: `backdrop-blur-md bg-white/5`
- Hover states: `hover:bg-white/10 transition-colors duration-200`
**Animation (Framer Motion):**
- Initial: `opacity: 0, y: 10`
- Animate: `opacity: 1, y: 0`
- Exit: `opacity: 0, scale: 0.95`

### Component: `<SearchInput />`
**Props:**
- `id: string` - Unique identifier
- `data: SearchInputData` - Core payload
- `isActive: boolean` - Styling toggle
- `onInteraction: (e: React.MouseEvent) => void`
**Styling Requirements:**
- Dark mode default: `bg-slate-900 text-slate-50`
- Glassmorphism: `backdrop-blur-md bg-white/5`
- Hover states: `hover:bg-white/10 transition-colors duration-200`
**Animation (Framer Motion):**
- Initial: `opacity: 0, y: 10`
- Animate: `opacity: 1, y: 0`
- Exit: `opacity: 0, scale: 0.95`

### Component: `<GenreCard />`
**Props:**
- `id: string` - Unique identifier
- `data: GenreCardData` - Core payload
- `isActive: boolean` - Styling toggle
- `onInteraction: (e: React.MouseEvent) => void`
**Styling Requirements:**
- Dark mode default: `bg-slate-900 text-slate-50`
- Glassmorphism: `backdrop-blur-md bg-white/5`
- Hover states: `hover:bg-white/10 transition-colors duration-200`
**Animation (Framer Motion):**
- Initial: `opacity: 0, y: 10`
- Animate: `opacity: 1, y: 0`
- Exit: `opacity: 0, scale: 0.95`

### Component: `<SettingsModal />`
**Props:**
- `id: string` - Unique identifier
- `data: SettingsModalData` - Core payload
- `isActive: boolean` - Styling toggle
- `onInteraction: (e: React.MouseEvent) => void`
**Styling Requirements:**
- Dark mode default: `bg-slate-900 text-slate-50`
- Glassmorphism: `backdrop-blur-md bg-white/5`
- Hover states: `hover:bg-white/10 transition-colors duration-200`
**Animation (Framer Motion):**
- Initial: `opacity: 0, y: 10`
- Animate: `opacity: 1, y: 0`
- Exit: `opacity: 0, scale: 0.95`

### Component: `<VolumeSlider />`
**Props:**
- `id: string` - Unique identifier
- `data: VolumeSliderData` - Core payload
- `isActive: boolean` - Styling toggle
- `onInteraction: (e: React.MouseEvent) => void`
**Styling Requirements:**
- Dark mode default: `bg-slate-900 text-slate-50`
- Glassmorphism: `backdrop-blur-md bg-white/5`
- Hover states: `hover:bg-white/10 transition-colors duration-200`
**Animation (Framer Motion):**
- Initial: `opacity: 0, y: 10`
- Animate: `opacity: 1, y: 0`
- Exit: `opacity: 0, scale: 0.95`

### Component: `<ProgressBar />`
**Props:**
- `id: string` - Unique identifier
- `data: ProgressBarData` - Core payload
- `isActive: boolean` - Styling toggle
- `onInteraction: (e: React.MouseEvent) => void`
**Styling Requirements:**
- Dark mode default: `bg-slate-900 text-slate-50`
- Glassmorphism: `backdrop-blur-md bg-white/5`
- Hover states: `hover:bg-white/10 transition-colors duration-200`
**Animation (Framer Motion):**
- Initial: `opacity: 0, y: 10`
- Animate: `opacity: 1, y: 0`
- Exit: `opacity: 0, scale: 0.95`

### Component: `<PlayPauseButton />`
**Props:**
- `id: string` - Unique identifier
- `data: PlayPauseButtonData` - Core payload
- `isActive: boolean` - Styling toggle
- `onInteraction: (e: React.MouseEvent) => void`
**Styling Requirements:**
- Dark mode default: `bg-slate-900 text-slate-50`
- Glassmorphism: `backdrop-blur-md bg-white/5`
- Hover states: `hover:bg-white/10 transition-colors duration-200`
**Animation (Framer Motion):**
- Initial: `opacity: 0, y: 10`
- Animate: `opacity: 1, y: 0`
- Exit: `opacity: 0, scale: 0.95`

### Component: `<LikeButton />`
**Props:**
- `id: string` - Unique identifier
- `data: LikeButtonData` - Core payload
- `isActive: boolean` - Styling toggle
- `onInteraction: (e: React.MouseEvent) => void`
**Styling Requirements:**
- Dark mode default: `bg-slate-900 text-slate-50`
- Glassmorphism: `backdrop-blur-md bg-white/5`
- Hover states: `hover:bg-white/10 transition-colors duration-200`
**Animation (Framer Motion):**
- Initial: `opacity: 0, y: 10`
- Animate: `opacity: 1, y: 0`
- Exit: `opacity: 0, scale: 0.95`

### Component: `<EqualizerCanvas />`
**Props:**
- `id: string` - Unique identifier
- `data: EqualizerCanvasData` - Core payload
- `isActive: boolean` - Styling toggle
- `onInteraction: (e: React.MouseEvent) => void`
**Styling Requirements:**
- Dark mode default: `bg-slate-900 text-slate-50`
- Glassmorphism: `backdrop-blur-md bg-white/5`
- Hover states: `hover:bg-white/10 transition-colors duration-200`
**Animation (Framer Motion):**
- Initial: `opacity: 0, y: 10`
- Animate: `opacity: 1, y: 0`
- Exit: `opacity: 0, scale: 0.95`

### Component: `<Sidebar />`
**Props:**
- `id: string` - Unique identifier
- `data: SidebarData` - Core payload
- `isActive: boolean` - Styling toggle
- `onInteraction: (e: React.MouseEvent) => void`
**Styling Requirements:**
- Dark mode default: `bg-slate-900 text-slate-50`
- Glassmorphism: `backdrop-blur-md bg-white/5`
- Hover states: `hover:bg-white/10 transition-colors duration-200`
**Animation (Framer Motion):**
- Initial: `opacity: 0, y: 10`
- Animate: `opacity: 1, y: 0`
- Exit: `opacity: 0, scale: 0.95`

### Component: `<BottomPlayer />`
**Props:**
- `id: string` - Unique identifier
- `data: BottomPlayerData` - Core payload
- `isActive: boolean` - Styling toggle
- `onInteraction: (e: React.MouseEvent) => void`
**Styling Requirements:**
- Dark mode default: `bg-slate-900 text-slate-50`
- Glassmorphism: `backdrop-blur-md bg-white/5`
- Hover states: `hover:bg-white/10 transition-colors duration-200`
**Animation (Framer Motion):**
- Initial: `opacity: 0, y: 10`
- Animate: `opacity: 1, y: 0`
- Exit: `opacity: 0, scale: 0.95`

### Component: `<MobileTabNav />`
**Props:**
- `id: string` - Unique identifier
- `data: MobileTabNavData` - Core payload
- `isActive: boolean` - Styling toggle
- `onInteraction: (e: React.MouseEvent) => void`
**Styling Requirements:**
- Dark mode default: `bg-slate-900 text-slate-50`
- Glassmorphism: `backdrop-blur-md bg-white/5`
- Hover states: `hover:bg-white/10 transition-colors duration-200`
**Animation (Framer Motion):**
- Initial: `opacity: 0, y: 10`
- Animate: `opacity: 1, y: 0`
- Exit: `opacity: 0, scale: 0.95`

### Component: `<TrackRow />`
**Props:**
- `id: string` - Unique identifier
- `data: TrackRowData` - Core payload
- `isActive: boolean` - Styling toggle
- `onInteraction: (e: React.MouseEvent) => void`
**Styling Requirements:**
- Dark mode default: `bg-slate-900 text-slate-50`
- Glassmorphism: `backdrop-blur-md bg-white/5`
- Hover states: `hover:bg-white/10 transition-colors duration-200`
**Animation (Framer Motion):**
- Initial: `opacity: 0, y: 10`
- Animate: `opacity: 1, y: 0`
- Exit: `opacity: 0, scale: 0.95`

### Component: `<AlbumCard />`
**Props:**
- `id: string` - Unique identifier
- `data: AlbumCardData` - Core payload
- `isActive: boolean` - Styling toggle
- `onInteraction: (e: React.MouseEvent) => void`
**Styling Requirements:**
- Dark mode default: `bg-slate-900 text-slate-50`
- Glassmorphism: `backdrop-blur-md bg-white/5`
- Hover states: `hover:bg-white/10 transition-colors duration-200`
**Animation (Framer Motion):**
- Initial: `opacity: 0, y: 10`
- Animate: `opacity: 1, y: 0`
- Exit: `opacity: 0, scale: 0.95`

### Component: `<PlaylistHeader />`
**Props:**
- `id: string` - Unique identifier
- `data: PlaylistHeaderData` - Core payload
- `isActive: boolean` - Styling toggle
- `onInteraction: (e: React.MouseEvent) => void`
**Styling Requirements:**
- Dark mode default: `bg-slate-900 text-slate-50`
- Glassmorphism: `backdrop-blur-md bg-white/5`
- Hover states: `hover:bg-white/10 transition-colors duration-200`
**Animation (Framer Motion):**
- Initial: `opacity: 0, y: 10`
- Animate: `opacity: 1, y: 0`
- Exit: `opacity: 0, scale: 0.95`

### Component: `<QueueList />`
**Props:**
- `id: string` - Unique identifier
- `data: QueueListData` - Core payload
- `isActive: boolean` - Styling toggle
- `onInteraction: (e: React.MouseEvent) => void`
**Styling Requirements:**
- Dark mode default: `bg-slate-900 text-slate-50`
- Glassmorphism: `backdrop-blur-md bg-white/5`
- Hover states: `hover:bg-white/10 transition-colors duration-200`
**Animation (Framer Motion):**
- Initial: `opacity: 0, y: 10`
- Animate: `opacity: 1, y: 0`
- Exit: `opacity: 0, scale: 0.95`

### Component: `<LyricsView />`
**Props:**
- `id: string` - Unique identifier
- `data: LyricsViewData` - Core payload
- `isActive: boolean` - Styling toggle
- `onInteraction: (e: React.MouseEvent) => void`
**Styling Requirements:**
- Dark mode default: `bg-slate-900 text-slate-50`
- Glassmorphism: `backdrop-blur-md bg-white/5`
- Hover states: `hover:bg-white/10 transition-colors duration-200`
**Animation (Framer Motion):**
- Initial: `opacity: 0, y: 10`
- Animate: `opacity: 1, y: 0`
- Exit: `opacity: 0, scale: 0.95`

### Component: `<VideoPlayerOverlay />`
**Props:**
- `id: string` - Unique identifier
- `data: VideoPlayerOverlayData` - Core payload
- `isActive: boolean` - Styling toggle
- `onInteraction: (e: React.MouseEvent) => void`
**Styling Requirements:**
- Dark mode default: `bg-slate-900 text-slate-50`
- Glassmorphism: `backdrop-blur-md bg-white/5`
- Hover states: `hover:bg-white/10 transition-colors duration-200`
**Animation (Framer Motion):**
- Initial: `opacity: 0, y: 10`
- Animate: `opacity: 1, y: 0`
- Exit: `opacity: 0, scale: 0.95`

### Component: `<FriendActivityFeed />`
**Props:**
- `id: string` - Unique identifier
- `data: FriendActivityFeedData` - Core payload
- `isActive: boolean` - Styling toggle
- `onInteraction: (e: React.MouseEvent) => void`
**Styling Requirements:**
- Dark mode default: `bg-slate-900 text-slate-50`
- Glassmorphism: `backdrop-blur-md bg-white/5`
- Hover states: `hover:bg-white/10 transition-colors duration-200`
**Animation (Framer Motion):**
- Initial: `opacity: 0, y: 10`
- Animate: `opacity: 1, y: 0`
- Exit: `opacity: 0, scale: 0.95`

### Component: `<SearchInput />`
**Props:**
- `id: string` - Unique identifier
- `data: SearchInputData` - Core payload
- `isActive: boolean` - Styling toggle
- `onInteraction: (e: React.MouseEvent) => void`
**Styling Requirements:**
- Dark mode default: `bg-slate-900 text-slate-50`
- Glassmorphism: `backdrop-blur-md bg-white/5`
- Hover states: `hover:bg-white/10 transition-colors duration-200`
**Animation (Framer Motion):**
- Initial: `opacity: 0, y: 10`
- Animate: `opacity: 1, y: 0`
- Exit: `opacity: 0, scale: 0.95`

### Component: `<GenreCard />`
**Props:**
- `id: string` - Unique identifier
- `data: GenreCardData` - Core payload
- `isActive: boolean` - Styling toggle
- `onInteraction: (e: React.MouseEvent) => void`
**Styling Requirements:**
- Dark mode default: `bg-slate-900 text-slate-50`
- Glassmorphism: `backdrop-blur-md bg-white/5`
- Hover states: `hover:bg-white/10 transition-colors duration-200`
**Animation (Framer Motion):**
- Initial: `opacity: 0, y: 10`
- Animate: `opacity: 1, y: 0`
- Exit: `opacity: 0, scale: 0.95`

### Component: `<SettingsModal />`
**Props:**
- `id: string` - Unique identifier
- `data: SettingsModalData` - Core payload
- `isActive: boolean` - Styling toggle
- `onInteraction: (e: React.MouseEvent) => void`
**Styling Requirements:**
- Dark mode default: `bg-slate-900 text-slate-50`
- Glassmorphism: `backdrop-blur-md bg-white/5`
- Hover states: `hover:bg-white/10 transition-colors duration-200`
**Animation (Framer Motion):**
- Initial: `opacity: 0, y: 10`
- Animate: `opacity: 1, y: 0`
- Exit: `opacity: 0, scale: 0.95`

### Component: `<VolumeSlider />`
**Props:**
- `id: string` - Unique identifier
- `data: VolumeSliderData` - Core payload
- `isActive: boolean` - Styling toggle
- `onInteraction: (e: React.MouseEvent) => void`
**Styling Requirements:**
- Dark mode default: `bg-slate-900 text-slate-50`
- Glassmorphism: `backdrop-blur-md bg-white/5`
- Hover states: `hover:bg-white/10 transition-colors duration-200`
**Animation (Framer Motion):**
- Initial: `opacity: 0, y: 10`
- Animate: `opacity: 1, y: 0`
- Exit: `opacity: 0, scale: 0.95`

### Component: `<ProgressBar />`
**Props:**
- `id: string` - Unique identifier
- `data: ProgressBarData` - Core payload
- `isActive: boolean` - Styling toggle
- `onInteraction: (e: React.MouseEvent) => void`
**Styling Requirements:**
- Dark mode default: `bg-slate-900 text-slate-50`
- Glassmorphism: `backdrop-blur-md bg-white/5`
- Hover states: `hover:bg-white/10 transition-colors duration-200`
**Animation (Framer Motion):**
- Initial: `opacity: 0, y: 10`
- Animate: `opacity: 1, y: 0`
- Exit: `opacity: 0, scale: 0.95`

### Component: `<PlayPauseButton />`
**Props:**
- `id: string` - Unique identifier
- `data: PlayPauseButtonData` - Core payload
- `isActive: boolean` - Styling toggle
- `onInteraction: (e: React.MouseEvent) => void`
**Styling Requirements:**
- Dark mode default: `bg-slate-900 text-slate-50`
- Glassmorphism: `backdrop-blur-md bg-white/5`
- Hover states: `hover:bg-white/10 transition-colors duration-200`
**Animation (Framer Motion):**
- Initial: `opacity: 0, y: 10`
- Animate: `opacity: 1, y: 0`
- Exit: `opacity: 0, scale: 0.95`

### Component: `<LikeButton />`
**Props:**
- `id: string` - Unique identifier
- `data: LikeButtonData` - Core payload
- `isActive: boolean` - Styling toggle
- `onInteraction: (e: React.MouseEvent) => void`
**Styling Requirements:**
- Dark mode default: `bg-slate-900 text-slate-50`
- Glassmorphism: `backdrop-blur-md bg-white/5`
- Hover states: `hover:bg-white/10 transition-colors duration-200`
**Animation (Framer Motion):**
- Initial: `opacity: 0, y: 10`
- Animate: `opacity: 1, y: 0`
- Exit: `opacity: 0, scale: 0.95`

### Component: `<EqualizerCanvas />`
**Props:**
- `id: string` - Unique identifier
- `data: EqualizerCanvasData` - Core payload
- `isActive: boolean` - Styling toggle
- `onInteraction: (e: React.MouseEvent) => void`
**Styling Requirements:**
- Dark mode default: `bg-slate-900 text-slate-50`
- Glassmorphism: `backdrop-blur-md bg-white/5`
- Hover states: `hover:bg-white/10 transition-colors duration-200`
**Animation (Framer Motion):**
- Initial: `opacity: 0, y: 10`
- Animate: `opacity: 1, y: 0`
- Exit: `opacity: 0, scale: 0.95`

### Component: `<Sidebar />`
**Props:**
- `id: string` - Unique identifier
- `data: SidebarData` - Core payload
- `isActive: boolean` - Styling toggle
- `onInteraction: (e: React.MouseEvent) => void`
**Styling Requirements:**
- Dark mode default: `bg-slate-900 text-slate-50`
- Glassmorphism: `backdrop-blur-md bg-white/5`
- Hover states: `hover:bg-white/10 transition-colors duration-200`
**Animation (Framer Motion):**
- Initial: `opacity: 0, y: 10`
- Animate: `opacity: 1, y: 0`
- Exit: `opacity: 0, scale: 0.95`

### Component: `<BottomPlayer />`
**Props:**
- `id: string` - Unique identifier
- `data: BottomPlayerData` - Core payload
- `isActive: boolean` - Styling toggle
- `onInteraction: (e: React.MouseEvent) => void`
**Styling Requirements:**
- Dark mode default: `bg-slate-900 text-slate-50`
- Glassmorphism: `backdrop-blur-md bg-white/5`
- Hover states: `hover:bg-white/10 transition-colors duration-200`
**Animation (Framer Motion):**
- Initial: `opacity: 0, y: 10`
- Animate: `opacity: 1, y: 0`
- Exit: `opacity: 0, scale: 0.95`

### Component: `<MobileTabNav />`
**Props:**
- `id: string` - Unique identifier
- `data: MobileTabNavData` - Core payload
- `isActive: boolean` - Styling toggle
- `onInteraction: (e: React.MouseEvent) => void`
**Styling Requirements:**
- Dark mode default: `bg-slate-900 text-slate-50`
- Glassmorphism: `backdrop-blur-md bg-white/5`
- Hover states: `hover:bg-white/10 transition-colors duration-200`
**Animation (Framer Motion):**
- Initial: `opacity: 0, y: 10`
- Animate: `opacity: 1, y: 0`
- Exit: `opacity: 0, scale: 0.95`

### Component: `<TrackRow />`
**Props:**
- `id: string` - Unique identifier
- `data: TrackRowData` - Core payload
- `isActive: boolean` - Styling toggle
- `onInteraction: (e: React.MouseEvent) => void`
**Styling Requirements:**
- Dark mode default: `bg-slate-900 text-slate-50`
- Glassmorphism: `backdrop-blur-md bg-white/5`
- Hover states: `hover:bg-white/10 transition-colors duration-200`
**Animation (Framer Motion):**
- Initial: `opacity: 0, y: 10`
- Animate: `opacity: 1, y: 0`
- Exit: `opacity: 0, scale: 0.95`

### Component: `<AlbumCard />`
**Props:**
- `id: string` - Unique identifier
- `data: AlbumCardData` - Core payload
- `isActive: boolean` - Styling toggle
- `onInteraction: (e: React.MouseEvent) => void`
**Styling Requirements:**
- Dark mode default: `bg-slate-900 text-slate-50`
- Glassmorphism: `backdrop-blur-md bg-white/5`
- Hover states: `hover:bg-white/10 transition-colors duration-200`
**Animation (Framer Motion):**
- Initial: `opacity: 0, y: 10`
- Animate: `opacity: 1, y: 0`
- Exit: `opacity: 0, scale: 0.95`

### Component: `<PlaylistHeader />`
**Props:**
- `id: string` - Unique identifier
- `data: PlaylistHeaderData` - Core payload
- `isActive: boolean` - Styling toggle
- `onInteraction: (e: React.MouseEvent) => void`
**Styling Requirements:**
- Dark mode default: `bg-slate-900 text-slate-50`
- Glassmorphism: `backdrop-blur-md bg-white/5`
- Hover states: `hover:bg-white/10 transition-colors duration-200`
**Animation (Framer Motion):**
- Initial: `opacity: 0, y: 10`
- Animate: `opacity: 1, y: 0`
- Exit: `opacity: 0, scale: 0.95`

### Component: `<QueueList />`
**Props:**
- `id: string` - Unique identifier
- `data: QueueListData` - Core payload
- `isActive: boolean` - Styling toggle
- `onInteraction: (e: React.MouseEvent) => void`
**Styling Requirements:**
- Dark mode default: `bg-slate-900 text-slate-50`
- Glassmorphism: `backdrop-blur-md bg-white/5`
- Hover states: `hover:bg-white/10 transition-colors duration-200`
**Animation (Framer Motion):**
- Initial: `opacity: 0, y: 10`
- Animate: `opacity: 1, y: 0`
- Exit: `opacity: 0, scale: 0.95`

### Component: `<LyricsView />`
**Props:**
- `id: string` - Unique identifier
- `data: LyricsViewData` - Core payload
- `isActive: boolean` - Styling toggle
- `onInteraction: (e: React.MouseEvent) => void`
**Styling Requirements:**
- Dark mode default: `bg-slate-900 text-slate-50`
- Glassmorphism: `backdrop-blur-md bg-white/5`
- Hover states: `hover:bg-white/10 transition-colors duration-200`
**Animation (Framer Motion):**
- Initial: `opacity: 0, y: 10`
- Animate: `opacity: 1, y: 0`
- Exit: `opacity: 0, scale: 0.95`

### Component: `<VideoPlayerOverlay />`
**Props:**
- `id: string` - Unique identifier
- `data: VideoPlayerOverlayData` - Core payload
- `isActive: boolean` - Styling toggle
- `onInteraction: (e: React.MouseEvent) => void`
**Styling Requirements:**
- Dark mode default: `bg-slate-900 text-slate-50`
- Glassmorphism: `backdrop-blur-md bg-white/5`
- Hover states: `hover:bg-white/10 transition-colors duration-200`
**Animation (Framer Motion):**
- Initial: `opacity: 0, y: 10`
- Animate: `opacity: 1, y: 0`
- Exit: `opacity: 0, scale: 0.95`

### Component: `<FriendActivityFeed />`
**Props:**
- `id: string` - Unique identifier
- `data: FriendActivityFeedData` - Core payload
- `isActive: boolean` - Styling toggle
- `onInteraction: (e: React.MouseEvent) => void`
**Styling Requirements:**
- Dark mode default: `bg-slate-900 text-slate-50`
- Glassmorphism: `backdrop-blur-md bg-white/5`
- Hover states: `hover:bg-white/10 transition-colors duration-200`
**Animation (Framer Motion):**
- Initial: `opacity: 0, y: 10`
- Animate: `opacity: 1, y: 0`
- Exit: `opacity: 0, scale: 0.95`

### Component: `<SearchInput />`
**Props:**
- `id: string` - Unique identifier
- `data: SearchInputData` - Core payload
- `isActive: boolean` - Styling toggle
- `onInteraction: (e: React.MouseEvent) => void`
**Styling Requirements:**
- Dark mode default: `bg-slate-900 text-slate-50`
- Glassmorphism: `backdrop-blur-md bg-white/5`
- Hover states: `hover:bg-white/10 transition-colors duration-200`
**Animation (Framer Motion):**
- Initial: `opacity: 0, y: 10`
- Animate: `opacity: 1, y: 0`
- Exit: `opacity: 0, scale: 0.95`

### Component: `<GenreCard />`
**Props:**
- `id: string` - Unique identifier
- `data: GenreCardData` - Core payload
- `isActive: boolean` - Styling toggle
- `onInteraction: (e: React.MouseEvent) => void`
**Styling Requirements:**
- Dark mode default: `bg-slate-900 text-slate-50`
- Glassmorphism: `backdrop-blur-md bg-white/5`
- Hover states: `hover:bg-white/10 transition-colors duration-200`
**Animation (Framer Motion):**
- Initial: `opacity: 0, y: 10`
- Animate: `opacity: 1, y: 0`
- Exit: `opacity: 0, scale: 0.95`

### Component: `<SettingsModal />`
**Props:**
- `id: string` - Unique identifier
- `data: SettingsModalData` - Core payload
- `isActive: boolean` - Styling toggle
- `onInteraction: (e: React.MouseEvent) => void`
**Styling Requirements:**
- Dark mode default: `bg-slate-900 text-slate-50`
- Glassmorphism: `backdrop-blur-md bg-white/5`
- Hover states: `hover:bg-white/10 transition-colors duration-200`
**Animation (Framer Motion):**
- Initial: `opacity: 0, y: 10`
- Animate: `opacity: 1, y: 0`
- Exit: `opacity: 0, scale: 0.95`

### Component: `<VolumeSlider />`
**Props:**
- `id: string` - Unique identifier
- `data: VolumeSliderData` - Core payload
- `isActive: boolean` - Styling toggle
- `onInteraction: (e: React.MouseEvent) => void`
**Styling Requirements:**
- Dark mode default: `bg-slate-900 text-slate-50`
- Glassmorphism: `backdrop-blur-md bg-white/5`
- Hover states: `hover:bg-white/10 transition-colors duration-200`
**Animation (Framer Motion):**
- Initial: `opacity: 0, y: 10`
- Animate: `opacity: 1, y: 0`
- Exit: `opacity: 0, scale: 0.95`

### Component: `<ProgressBar />`
**Props:**
- `id: string` - Unique identifier
- `data: ProgressBarData` - Core payload
- `isActive: boolean` - Styling toggle
- `onInteraction: (e: React.MouseEvent) => void`
**Styling Requirements:**
- Dark mode default: `bg-slate-900 text-slate-50`
- Glassmorphism: `backdrop-blur-md bg-white/5`
- Hover states: `hover:bg-white/10 transition-colors duration-200`
**Animation (Framer Motion):**
- Initial: `opacity: 0, y: 10`
- Animate: `opacity: 1, y: 0`
- Exit: `opacity: 0, scale: 0.95`

### Component: `<PlayPauseButton />`
**Props:**
- `id: string` - Unique identifier
- `data: PlayPauseButtonData` - Core payload
- `isActive: boolean` - Styling toggle
- `onInteraction: (e: React.MouseEvent) => void`
**Styling Requirements:**
- Dark mode default: `bg-slate-900 text-slate-50`
- Glassmorphism: `backdrop-blur-md bg-white/5`
- Hover states: `hover:bg-white/10 transition-colors duration-200`
**Animation (Framer Motion):**
- Initial: `opacity: 0, y: 10`
- Animate: `opacity: 1, y: 0`
- Exit: `opacity: 0, scale: 0.95`

### Component: `<LikeButton />`
**Props:**
- `id: string` - Unique identifier
- `data: LikeButtonData` - Core payload
- `isActive: boolean` - Styling toggle
- `onInteraction: (e: React.MouseEvent) => void`
**Styling Requirements:**
- Dark mode default: `bg-slate-900 text-slate-50`
- Glassmorphism: `backdrop-blur-md bg-white/5`
- Hover states: `hover:bg-white/10 transition-colors duration-200`
**Animation (Framer Motion):**
- Initial: `opacity: 0, y: 10`
- Animate: `opacity: 1, y: 0`
- Exit: `opacity: 0, scale: 0.95`

### Component: `<EqualizerCanvas />`
**Props:**
- `id: string` - Unique identifier
- `data: EqualizerCanvasData` - Core payload
- `isActive: boolean` - Styling toggle
- `onInteraction: (e: React.MouseEvent) => void`
**Styling Requirements:**
- Dark mode default: `bg-slate-900 text-slate-50`
- Glassmorphism: `backdrop-blur-md bg-white/5`
- Hover states: `hover:bg-white/10 transition-colors duration-200`
**Animation (Framer Motion):**
- Initial: `opacity: 0, y: 10`
- Animate: `opacity: 1, y: 0`
- Exit: `opacity: 0, scale: 0.95`

### Component: `<Sidebar />`
**Props:**
- `id: string` - Unique identifier
- `data: SidebarData` - Core payload
- `isActive: boolean` - Styling toggle
- `onInteraction: (e: React.MouseEvent) => void`
**Styling Requirements:**
- Dark mode default: `bg-slate-900 text-slate-50`
- Glassmorphism: `backdrop-blur-md bg-white/5`
- Hover states: `hover:bg-white/10 transition-colors duration-200`
**Animation (Framer Motion):**
- Initial: `opacity: 0, y: 10`
- Animate: `opacity: 1, y: 0`
- Exit: `opacity: 0, scale: 0.95`

### Component: `<BottomPlayer />`
**Props:**
- `id: string` - Unique identifier
- `data: BottomPlayerData` - Core payload
- `isActive: boolean` - Styling toggle
- `onInteraction: (e: React.MouseEvent) => void`
**Styling Requirements:**
- Dark mode default: `bg-slate-900 text-slate-50`
- Glassmorphism: `backdrop-blur-md bg-white/5`
- Hover states: `hover:bg-white/10 transition-colors duration-200`
**Animation (Framer Motion):**
- Initial: `opacity: 0, y: 10`
- Animate: `opacity: 1, y: 0`
- Exit: `opacity: 0, scale: 0.95`

### Component: `<MobileTabNav />`
**Props:**
- `id: string` - Unique identifier
- `data: MobileTabNavData` - Core payload
- `isActive: boolean` - Styling toggle
- `onInteraction: (e: React.MouseEvent) => void`
**Styling Requirements:**
- Dark mode default: `bg-slate-900 text-slate-50`
- Glassmorphism: `backdrop-blur-md bg-white/5`
- Hover states: `hover:bg-white/10 transition-colors duration-200`
**Animation (Framer Motion):**
- Initial: `opacity: 0, y: 10`
- Animate: `opacity: 1, y: 0`
- Exit: `opacity: 0, scale: 0.95`

### Component: `<TrackRow />`
**Props:**
- `id: string` - Unique identifier
- `data: TrackRowData` - Core payload
- `isActive: boolean` - Styling toggle
- `onInteraction: (e: React.MouseEvent) => void`
**Styling Requirements:**
- Dark mode default: `bg-slate-900 text-slate-50`
- Glassmorphism: `backdrop-blur-md bg-white/5`
- Hover states: `hover:bg-white/10 transition-colors duration-200`
**Animation (Framer Motion):**
- Initial: `opacity: 0, y: 10`
- Animate: `opacity: 1, y: 0`
- Exit: `opacity: 0, scale: 0.95`

### Component: `<AlbumCard />`
**Props:**
- `id: string` - Unique identifier
- `data: AlbumCardData` - Core payload
- `isActive: boolean` - Styling toggle
- `onInteraction: (e: React.MouseEvent) => void`
**Styling Requirements:**
- Dark mode default: `bg-slate-900 text-slate-50`
- Glassmorphism: `backdrop-blur-md bg-white/5`
- Hover states: `hover:bg-white/10 transition-colors duration-200`
**Animation (Framer Motion):**
- Initial: `opacity: 0, y: 10`
- Animate: `opacity: 1, y: 0`
- Exit: `opacity: 0, scale: 0.95`

### Component: `<PlaylistHeader />`
**Props:**
- `id: string` - Unique identifier
- `data: PlaylistHeaderData` - Core payload
- `isActive: boolean` - Styling toggle
- `onInteraction: (e: React.MouseEvent) => void`
**Styling Requirements:**
- Dark mode default: `bg-slate-900 text-slate-50`
- Glassmorphism: `backdrop-blur-md bg-white/5`
- Hover states: `hover:bg-white/10 transition-colors duration-200`
**Animation (Framer Motion):**
- Initial: `opacity: 0, y: 10`
- Animate: `opacity: 1, y: 0`
- Exit: `opacity: 0, scale: 0.95`

### Component: `<QueueList />`
**Props:**
- `id: string` - Unique identifier
- `data: QueueListData` - Core payload
- `isActive: boolean` - Styling toggle
- `onInteraction: (e: React.MouseEvent) => void`
**Styling Requirements:**
- Dark mode default: `bg-slate-900 text-slate-50`
- Glassmorphism: `backdrop-blur-md bg-white/5`
- Hover states: `hover:bg-white/10 transition-colors duration-200`
**Animation (Framer Motion):**
- Initial: `opacity: 0, y: 10`
- Animate: `opacity: 1, y: 0`
- Exit: `opacity: 0, scale: 0.95`

### Component: `<LyricsView />`
**Props:**
- `id: string` - Unique identifier
- `data: LyricsViewData` - Core payload
- `isActive: boolean` - Styling toggle
- `onInteraction: (e: React.MouseEvent) => void`
**Styling Requirements:**
- Dark mode default: `bg-slate-900 text-slate-50`
- Glassmorphism: `backdrop-blur-md bg-white/5`
- Hover states: `hover:bg-white/10 transition-colors duration-200`
**Animation (Framer Motion):**
- Initial: `opacity: 0, y: 10`
- Animate: `opacity: 1, y: 0`
- Exit: `opacity: 0, scale: 0.95`

### Component: `<VideoPlayerOverlay />`
**Props:**
- `id: string` - Unique identifier
- `data: VideoPlayerOverlayData` - Core payload
- `isActive: boolean` - Styling toggle
- `onInteraction: (e: React.MouseEvent) => void`
**Styling Requirements:**
- Dark mode default: `bg-slate-900 text-slate-50`
- Glassmorphism: `backdrop-blur-md bg-white/5`
- Hover states: `hover:bg-white/10 transition-colors duration-200`
**Animation (Framer Motion):**
- Initial: `opacity: 0, y: 10`
- Animate: `opacity: 1, y: 0`
- Exit: `opacity: 0, scale: 0.95`

### Component: `<FriendActivityFeed />`
**Props:**
- `id: string` - Unique identifier
- `data: FriendActivityFeedData` - Core payload
- `isActive: boolean` - Styling toggle
- `onInteraction: (e: React.MouseEvent) => void`
**Styling Requirements:**
- Dark mode default: `bg-slate-900 text-slate-50`
- Glassmorphism: `backdrop-blur-md bg-white/5`
- Hover states: `hover:bg-white/10 transition-colors duration-200`
**Animation (Framer Motion):**
- Initial: `opacity: 0, y: 10`
- Animate: `opacity: 1, y: 0`
- Exit: `opacity: 0, scale: 0.95`

### Component: `<SearchInput />`
**Props:**
- `id: string` - Unique identifier
- `data: SearchInputData` - Core payload
- `isActive: boolean` - Styling toggle
- `onInteraction: (e: React.MouseEvent) => void`
**Styling Requirements:**
- Dark mode default: `bg-slate-900 text-slate-50`
- Glassmorphism: `backdrop-blur-md bg-white/5`
- Hover states: `hover:bg-white/10 transition-colors duration-200`
**Animation (Framer Motion):**
- Initial: `opacity: 0, y: 10`
- Animate: `opacity: 1, y: 0`
- Exit: `opacity: 0, scale: 0.95`

### Component: `<GenreCard />`
**Props:**
- `id: string` - Unique identifier
- `data: GenreCardData` - Core payload
- `isActive: boolean` - Styling toggle
- `onInteraction: (e: React.MouseEvent) => void`
**Styling Requirements:**
- Dark mode default: `bg-slate-900 text-slate-50`
- Glassmorphism: `backdrop-blur-md bg-white/5`
- Hover states: `hover:bg-white/10 transition-colors duration-200`
**Animation (Framer Motion):**
- Initial: `opacity: 0, y: 10`
- Animate: `opacity: 1, y: 0`
- Exit: `opacity: 0, scale: 0.95`

### Component: `<SettingsModal />`
**Props:**
- `id: string` - Unique identifier
- `data: SettingsModalData` - Core payload
- `isActive: boolean` - Styling toggle
- `onInteraction: (e: React.MouseEvent) => void`
**Styling Requirements:**
- Dark mode default: `bg-slate-900 text-slate-50`
- Glassmorphism: `backdrop-blur-md bg-white/5`
- Hover states: `hover:bg-white/10 transition-colors duration-200`
**Animation (Framer Motion):**
- Initial: `opacity: 0, y: 10`
- Animate: `opacity: 1, y: 0`
- Exit: `opacity: 0, scale: 0.95`

### Component: `<VolumeSlider />`
**Props:**
- `id: string` - Unique identifier
- `data: VolumeSliderData` - Core payload
- `isActive: boolean` - Styling toggle
- `onInteraction: (e: React.MouseEvent) => void`
**Styling Requirements:**
- Dark mode default: `bg-slate-900 text-slate-50`
- Glassmorphism: `backdrop-blur-md bg-white/5`
- Hover states: `hover:bg-white/10 transition-colors duration-200`
**Animation (Framer Motion):**
- Initial: `opacity: 0, y: 10`
- Animate: `opacity: 1, y: 0`
- Exit: `opacity: 0, scale: 0.95`

### Component: `<ProgressBar />`
**Props:**
- `id: string` - Unique identifier
- `data: ProgressBarData` - Core payload
- `isActive: boolean` - Styling toggle
- `onInteraction: (e: React.MouseEvent) => void`
**Styling Requirements:**
- Dark mode default: `bg-slate-900 text-slate-50`
- Glassmorphism: `backdrop-blur-md bg-white/5`
- Hover states: `hover:bg-white/10 transition-colors duration-200`
**Animation (Framer Motion):**
- Initial: `opacity: 0, y: 10`
- Animate: `opacity: 1, y: 0`
- Exit: `opacity: 0, scale: 0.95`

### Component: `<PlayPauseButton />`
**Props:**
- `id: string` - Unique identifier
- `data: PlayPauseButtonData` - Core payload
- `isActive: boolean` - Styling toggle
- `onInteraction: (e: React.MouseEvent) => void`
**Styling Requirements:**
- Dark mode default: `bg-slate-900 text-slate-50`
- Glassmorphism: `backdrop-blur-md bg-white/5`
- Hover states: `hover:bg-white/10 transition-colors duration-200`
**Animation (Framer Motion):**
- Initial: `opacity: 0, y: 10`
- Animate: `opacity: 1, y: 0`
- Exit: `opacity: 0, scale: 0.95`

### Component: `<LikeButton />`
**Props:**
- `id: string` - Unique identifier
- `data: LikeButtonData` - Core payload
- `isActive: boolean` - Styling toggle
- `onInteraction: (e: React.MouseEvent) => void`
**Styling Requirements:**
- Dark mode default: `bg-slate-900 text-slate-50`
- Glassmorphism: `backdrop-blur-md bg-white/5`
- Hover states: `hover:bg-white/10 transition-colors duration-200`
**Animation (Framer Motion):**
- Initial: `opacity: 0, y: 10`
- Animate: `opacity: 1, y: 0`
- Exit: `opacity: 0, scale: 0.95`

### Component: `<EqualizerCanvas />`
**Props:**
- `id: string` - Unique identifier
- `data: EqualizerCanvasData` - Core payload
- `isActive: boolean` - Styling toggle
- `onInteraction: (e: React.MouseEvent) => void`
**Styling Requirements:**
- Dark mode default: `bg-slate-900 text-slate-50`
- Glassmorphism: `backdrop-blur-md bg-white/5`
- Hover states: `hover:bg-white/10 transition-colors duration-200`
**Animation (Framer Motion):**
- Initial: `opacity: 0, y: 10`
- Animate: `opacity: 1, y: 0`
- Exit: `opacity: 0, scale: 0.95`

### Component: `<Sidebar />`
**Props:**
- `id: string` - Unique identifier
- `data: SidebarData` - Core payload
- `isActive: boolean` - Styling toggle
- `onInteraction: (e: React.MouseEvent) => void`
**Styling Requirements:**
- Dark mode default: `bg-slate-900 text-slate-50`
- Glassmorphism: `backdrop-blur-md bg-white/5`
- Hover states: `hover:bg-white/10 transition-colors duration-200`
**Animation (Framer Motion):**
- Initial: `opacity: 0, y: 10`
- Animate: `opacity: 1, y: 0`
- Exit: `opacity: 0, scale: 0.95`

### Component: `<BottomPlayer />`
**Props:**
- `id: string` - Unique identifier
- `data: BottomPlayerData` - Core payload
- `isActive: boolean` - Styling toggle
- `onInteraction: (e: React.MouseEvent) => void`
**Styling Requirements:**
- Dark mode default: `bg-slate-900 text-slate-50`
- Glassmorphism: `backdrop-blur-md bg-white/5`
- Hover states: `hover:bg-white/10 transition-colors duration-200`
**Animation (Framer Motion):**
- Initial: `opacity: 0, y: 10`
- Animate: `opacity: 1, y: 0`
- Exit: `opacity: 0, scale: 0.95`

### Component: `<MobileTabNav />`
**Props:**
- `id: string` - Unique identifier
- `data: MobileTabNavData` - Core payload
- `isActive: boolean` - Styling toggle
- `onInteraction: (e: React.MouseEvent) => void`
**Styling Requirements:**
- Dark mode default: `bg-slate-900 text-slate-50`
- Glassmorphism: `backdrop-blur-md bg-white/5`
- Hover states: `hover:bg-white/10 transition-colors duration-200`
**Animation (Framer Motion):**
- Initial: `opacity: 0, y: 10`
- Animate: `opacity: 1, y: 0`
- Exit: `opacity: 0, scale: 0.95`

### Component: `<TrackRow />`
**Props:**
- `id: string` - Unique identifier
- `data: TrackRowData` - Core payload
- `isActive: boolean` - Styling toggle
- `onInteraction: (e: React.MouseEvent) => void`
**Styling Requirements:**
- Dark mode default: `bg-slate-900 text-slate-50`
- Glassmorphism: `backdrop-blur-md bg-white/5`
- Hover states: `hover:bg-white/10 transition-colors duration-200`
**Animation (Framer Motion):**
- Initial: `opacity: 0, y: 10`
- Animate: `opacity: 1, y: 0`
- Exit: `opacity: 0, scale: 0.95`

### Component: `<AlbumCard />`
**Props:**
- `id: string` - Unique identifier
- `data: AlbumCardData` - Core payload
- `isActive: boolean` - Styling toggle
- `onInteraction: (e: React.MouseEvent) => void`
**Styling Requirements:**
- Dark mode default: `bg-slate-900 text-slate-50`
- Glassmorphism: `backdrop-blur-md bg-white/5`
- Hover states: `hover:bg-white/10 transition-colors duration-200`
**Animation (Framer Motion):**
- Initial: `opacity: 0, y: 10`
- Animate: `opacity: 1, y: 0`
- Exit: `opacity: 0, scale: 0.95`

### Component: `<PlaylistHeader />`
**Props:**
- `id: string` - Unique identifier
- `data: PlaylistHeaderData` - Core payload
- `isActive: boolean` - Styling toggle
- `onInteraction: (e: React.MouseEvent) => void`
**Styling Requirements:**
- Dark mode default: `bg-slate-900 text-slate-50`
- Glassmorphism: `backdrop-blur-md bg-white/5`
- Hover states: `hover:bg-white/10 transition-colors duration-200`
**Animation (Framer Motion):**
- Initial: `opacity: 0, y: 10`
- Animate: `opacity: 1, y: 0`
- Exit: `opacity: 0, scale: 0.95`

### Component: `<QueueList />`
**Props:**
- `id: string` - Unique identifier
- `data: QueueListData` - Core payload
- `isActive: boolean` - Styling toggle
- `onInteraction: (e: React.MouseEvent) => void`
**Styling Requirements:**
- Dark mode default: `bg-slate-900 text-slate-50`
- Glassmorphism: `backdrop-blur-md bg-white/5`
- Hover states: `hover:bg-white/10 transition-colors duration-200`
**Animation (Framer Motion):**
- Initial: `opacity: 0, y: 10`
- Animate: `opacity: 1, y: 0`
- Exit: `opacity: 0, scale: 0.95`

### Component: `<LyricsView />`
**Props:**
- `id: string` - Unique identifier
- `data: LyricsViewData` - Core payload
- `isActive: boolean` - Styling toggle
- `onInteraction: (e: React.MouseEvent) => void`
**Styling Requirements:**
- Dark mode default: `bg-slate-900 text-slate-50`
- Glassmorphism: `backdrop-blur-md bg-white/5`
- Hover states: `hover:bg-white/10 transition-colors duration-200`
**Animation (Framer Motion):**
- Initial: `opacity: 0, y: 10`
- Animate: `opacity: 1, y: 0`
- Exit: `opacity: 0, scale: 0.95`

### Component: `<VideoPlayerOverlay />`
**Props:**
- `id: string` - Unique identifier
- `data: VideoPlayerOverlayData` - Core payload
- `isActive: boolean` - Styling toggle
- `onInteraction: (e: React.MouseEvent) => void`
**Styling Requirements:**
- Dark mode default: `bg-slate-900 text-slate-50`
- Glassmorphism: `backdrop-blur-md bg-white/5`
- Hover states: `hover:bg-white/10 transition-colors duration-200`
**Animation (Framer Motion):**
- Initial: `opacity: 0, y: 10`
- Animate: `opacity: 1, y: 0`
- Exit: `opacity: 0, scale: 0.95`

### Component: `<FriendActivityFeed />`
**Props:**
- `id: string` - Unique identifier
- `data: FriendActivityFeedData` - Core payload
- `isActive: boolean` - Styling toggle
- `onInteraction: (e: React.MouseEvent) => void`
**Styling Requirements:**
- Dark mode default: `bg-slate-900 text-slate-50`
- Glassmorphism: `backdrop-blur-md bg-white/5`
- Hover states: `hover:bg-white/10 transition-colors duration-200`
**Animation (Framer Motion):**
- Initial: `opacity: 0, y: 10`
- Animate: `opacity: 1, y: 0`
- Exit: `opacity: 0, scale: 0.95`

### Component: `<SearchInput />`
**Props:**
- `id: string` - Unique identifier
- `data: SearchInputData` - Core payload
- `isActive: boolean` - Styling toggle
- `onInteraction: (e: React.MouseEvent) => void`
**Styling Requirements:**
- Dark mode default: `bg-slate-900 text-slate-50`
- Glassmorphism: `backdrop-blur-md bg-white/5`
- Hover states: `hover:bg-white/10 transition-colors duration-200`
**Animation (Framer Motion):**
- Initial: `opacity: 0, y: 10`
- Animate: `opacity: 1, y: 0`
- Exit: `opacity: 0, scale: 0.95`

### Component: `<GenreCard />`
**Props:**
- `id: string` - Unique identifier
- `data: GenreCardData` - Core payload
- `isActive: boolean` - Styling toggle
- `onInteraction: (e: React.MouseEvent) => void`
**Styling Requirements:**
- Dark mode default: `bg-slate-900 text-slate-50`
- Glassmorphism: `backdrop-blur-md bg-white/5`
- Hover states: `hover:bg-white/10 transition-colors duration-200`
**Animation (Framer Motion):**
- Initial: `opacity: 0, y: 10`
- Animate: `opacity: 1, y: 0`
- Exit: `opacity: 0, scale: 0.95`

### Component: `<SettingsModal />`
**Props:**
- `id: string` - Unique identifier
- `data: SettingsModalData` - Core payload
- `isActive: boolean` - Styling toggle
- `onInteraction: (e: React.MouseEvent) => void`
**Styling Requirements:**
- Dark mode default: `bg-slate-900 text-slate-50`
- Glassmorphism: `backdrop-blur-md bg-white/5`
- Hover states: `hover:bg-white/10 transition-colors duration-200`
**Animation (Framer Motion):**
- Initial: `opacity: 0, y: 10`
- Animate: `opacity: 1, y: 0`
- Exit: `opacity: 0, scale: 0.95`

### Component: `<VolumeSlider />`
**Props:**
- `id: string` - Unique identifier
- `data: VolumeSliderData` - Core payload
- `isActive: boolean` - Styling toggle
- `onInteraction: (e: React.MouseEvent) => void`
**Styling Requirements:**
- Dark mode default: `bg-slate-900 text-slate-50`
- Glassmorphism: `backdrop-blur-md bg-white/5`
- Hover states: `hover:bg-white/10 transition-colors duration-200`
**Animation (Framer Motion):**
- Initial: `opacity: 0, y: 10`
- Animate: `opacity: 1, y: 0`
- Exit: `opacity: 0, scale: 0.95`

### Component: `<ProgressBar />`
**Props:**
- `id: string` - Unique identifier
- `data: ProgressBarData` - Core payload
- `isActive: boolean` - Styling toggle
- `onInteraction: (e: React.MouseEvent) => void`
**Styling Requirements:**
- Dark mode default: `bg-slate-900 text-slate-50`
- Glassmorphism: `backdrop-blur-md bg-white/5`
- Hover states: `hover:bg-white/10 transition-colors duration-200`
**Animation (Framer Motion):**
- Initial: `opacity: 0, y: 10`
- Animate: `opacity: 1, y: 0`
- Exit: `opacity: 0, scale: 0.95`

### Component: `<PlayPauseButton />`
**Props:**
- `id: string` - Unique identifier
- `data: PlayPauseButtonData` - Core payload
- `isActive: boolean` - Styling toggle
- `onInteraction: (e: React.MouseEvent) => void`
**Styling Requirements:**
- Dark mode default: `bg-slate-900 text-slate-50`
- Glassmorphism: `backdrop-blur-md bg-white/5`
- Hover states: `hover:bg-white/10 transition-colors duration-200`
**Animation (Framer Motion):**
- Initial: `opacity: 0, y: 10`
- Animate: `opacity: 1, y: 0`
- Exit: `opacity: 0, scale: 0.95`

### Component: `<LikeButton />`
**Props:**
- `id: string` - Unique identifier
- `data: LikeButtonData` - Core payload
- `isActive: boolean` - Styling toggle
- `onInteraction: (e: React.MouseEvent) => void`
**Styling Requirements:**
- Dark mode default: `bg-slate-900 text-slate-50`
- Glassmorphism: `backdrop-blur-md bg-white/5`
- Hover states: `hover:bg-white/10 transition-colors duration-200`
**Animation (Framer Motion):**
- Initial: `opacity: 0, y: 10`
- Animate: `opacity: 1, y: 0`
- Exit: `opacity: 0, scale: 0.95`

### Component: `<EqualizerCanvas />`
**Props:**
- `id: string` - Unique identifier
- `data: EqualizerCanvasData` - Core payload
- `isActive: boolean` - Styling toggle
- `onInteraction: (e: React.MouseEvent) => void`
**Styling Requirements:**
- Dark mode default: `bg-slate-900 text-slate-50`
- Glassmorphism: `backdrop-blur-md bg-white/5`
- Hover states: `hover:bg-white/10 transition-colors duration-200`
**Animation (Framer Motion):**
- Initial: `opacity: 0, y: 10`
- Animate: `opacity: 1, y: 0`
- Exit: `opacity: 0, scale: 0.95`

## PHASE 5: ERROR HANDLING & EDGE CASES
You must implement resilient fallbacks for every conceivable failure.

### Edge Case 1: Handling Audio/Video Desync or Network Drop (Scenario 1)
**Condition:** User is on a 3G network and the YouTube iframe emits `BUFFERING` for more than 100ms.
**Resolution Strategy:**
1. Pause the global `progressMs` timer.
2. Display a subtle skeleton loader over the album art.
3. If buffer exceeds 5 seconds, attempt to lower the requested video quality parameter (`vq=small`).
4. If iframe throws Error 150 (embed disabled), immediately fetch a proxy stream or skip to the next track.

### Edge Case 2: Handling Audio/Video Desync or Network Drop (Scenario 2)
**Condition:** User is on a 3G network and the YouTube iframe emits `BUFFERING` for more than 200ms.
**Resolution Strategy:**
1. Pause the global `progressMs` timer.
2. Display a subtle skeleton loader over the album art.
3. If buffer exceeds 5 seconds, attempt to lower the requested video quality parameter (`vq=small`).
4. If iframe throws Error 150 (embed disabled), immediately fetch a proxy stream or skip to the next track.

### Edge Case 3: Handling Audio/Video Desync or Network Drop (Scenario 3)
**Condition:** User is on a 3G network and the YouTube iframe emits `BUFFERING` for more than 300ms.
**Resolution Strategy:**
1. Pause the global `progressMs` timer.
2. Display a subtle skeleton loader over the album art.
3. If buffer exceeds 5 seconds, attempt to lower the requested video quality parameter (`vq=small`).
4. If iframe throws Error 150 (embed disabled), immediately fetch a proxy stream or skip to the next track.

### Edge Case 4: Handling Audio/Video Desync or Network Drop (Scenario 4)
**Condition:** User is on a 3G network and the YouTube iframe emits `BUFFERING` for more than 400ms.
**Resolution Strategy:**
1. Pause the global `progressMs` timer.
2. Display a subtle skeleton loader over the album art.
3. If buffer exceeds 5 seconds, attempt to lower the requested video quality parameter (`vq=small`).
4. If iframe throws Error 150 (embed disabled), immediately fetch a proxy stream or skip to the next track.

### Edge Case 5: Handling Audio/Video Desync or Network Drop (Scenario 5)
**Condition:** User is on a 3G network and the YouTube iframe emits `BUFFERING` for more than 500ms.
**Resolution Strategy:**
1. Pause the global `progressMs` timer.
2. Display a subtle skeleton loader over the album art.
3. If buffer exceeds 5 seconds, attempt to lower the requested video quality parameter (`vq=small`).
4. If iframe throws Error 150 (embed disabled), immediately fetch a proxy stream or skip to the next track.

### Edge Case 6: Handling Audio/Video Desync or Network Drop (Scenario 6)
**Condition:** User is on a 3G network and the YouTube iframe emits `BUFFERING` for more than 600ms.
**Resolution Strategy:**
1. Pause the global `progressMs` timer.
2. Display a subtle skeleton loader over the album art.
3. If buffer exceeds 5 seconds, attempt to lower the requested video quality parameter (`vq=small`).
4. If iframe throws Error 150 (embed disabled), immediately fetch a proxy stream or skip to the next track.

### Edge Case 7: Handling Audio/Video Desync or Network Drop (Scenario 7)
**Condition:** User is on a 3G network and the YouTube iframe emits `BUFFERING` for more than 700ms.
**Resolution Strategy:**
1. Pause the global `progressMs` timer.
2. Display a subtle skeleton loader over the album art.
3. If buffer exceeds 5 seconds, attempt to lower the requested video quality parameter (`vq=small`).
4. If iframe throws Error 150 (embed disabled), immediately fetch a proxy stream or skip to the next track.

### Edge Case 8: Handling Audio/Video Desync or Network Drop (Scenario 8)
**Condition:** User is on a 3G network and the YouTube iframe emits `BUFFERING` for more than 800ms.
**Resolution Strategy:**
1. Pause the global `progressMs` timer.
2. Display a subtle skeleton loader over the album art.
3. If buffer exceeds 5 seconds, attempt to lower the requested video quality parameter (`vq=small`).
4. If iframe throws Error 150 (embed disabled), immediately fetch a proxy stream or skip to the next track.

### Edge Case 9: Handling Audio/Video Desync or Network Drop (Scenario 9)
**Condition:** User is on a 3G network and the YouTube iframe emits `BUFFERING` for more than 900ms.
**Resolution Strategy:**
1. Pause the global `progressMs` timer.
2. Display a subtle skeleton loader over the album art.
3. If buffer exceeds 5 seconds, attempt to lower the requested video quality parameter (`vq=small`).
4. If iframe throws Error 150 (embed disabled), immediately fetch a proxy stream or skip to the next track.

### Edge Case 10: Handling Audio/Video Desync or Network Drop (Scenario 10)
**Condition:** User is on a 3G network and the YouTube iframe emits `BUFFERING` for more than 1000ms.
**Resolution Strategy:**
1. Pause the global `progressMs` timer.
2. Display a subtle skeleton loader over the album art.
3. If buffer exceeds 5 seconds, attempt to lower the requested video quality parameter (`vq=small`).
4. If iframe throws Error 150 (embed disabled), immediately fetch a proxy stream or skip to the next track.

### Edge Case 11: Handling Audio/Video Desync or Network Drop (Scenario 11)
**Condition:** User is on a 3G network and the YouTube iframe emits `BUFFERING` for more than 1100ms.
**Resolution Strategy:**
1. Pause the global `progressMs` timer.
2. Display a subtle skeleton loader over the album art.
3. If buffer exceeds 5 seconds, attempt to lower the requested video quality parameter (`vq=small`).
4. If iframe throws Error 150 (embed disabled), immediately fetch a proxy stream or skip to the next track.

### Edge Case 12: Handling Audio/Video Desync or Network Drop (Scenario 12)
**Condition:** User is on a 3G network and the YouTube iframe emits `BUFFERING` for more than 1200ms.
**Resolution Strategy:**
1. Pause the global `progressMs` timer.
2. Display a subtle skeleton loader over the album art.
3. If buffer exceeds 5 seconds, attempt to lower the requested video quality parameter (`vq=small`).
4. If iframe throws Error 150 (embed disabled), immediately fetch a proxy stream or skip to the next track.

### Edge Case 13: Handling Audio/Video Desync or Network Drop (Scenario 13)
**Condition:** User is on a 3G network and the YouTube iframe emits `BUFFERING` for more than 1300ms.
**Resolution Strategy:**
1. Pause the global `progressMs` timer.
2. Display a subtle skeleton loader over the album art.
3. If buffer exceeds 5 seconds, attempt to lower the requested video quality parameter (`vq=small`).
4. If iframe throws Error 150 (embed disabled), immediately fetch a proxy stream or skip to the next track.

### Edge Case 14: Handling Audio/Video Desync or Network Drop (Scenario 14)
**Condition:** User is on a 3G network and the YouTube iframe emits `BUFFERING` for more than 1400ms.
**Resolution Strategy:**
1. Pause the global `progressMs` timer.
2. Display a subtle skeleton loader over the album art.
3. If buffer exceeds 5 seconds, attempt to lower the requested video quality parameter (`vq=small`).
4. If iframe throws Error 150 (embed disabled), immediately fetch a proxy stream or skip to the next track.

### Edge Case 15: Handling Audio/Video Desync or Network Drop (Scenario 15)
**Condition:** User is on a 3G network and the YouTube iframe emits `BUFFERING` for more than 1500ms.
**Resolution Strategy:**
1. Pause the global `progressMs` timer.
2. Display a subtle skeleton loader over the album art.
3. If buffer exceeds 5 seconds, attempt to lower the requested video quality parameter (`vq=small`).
4. If iframe throws Error 150 (embed disabled), immediately fetch a proxy stream or skip to the next track.

### Edge Case 16: Handling Audio/Video Desync or Network Drop (Scenario 16)
**Condition:** User is on a 3G network and the YouTube iframe emits `BUFFERING` for more than 1600ms.
**Resolution Strategy:**
1. Pause the global `progressMs` timer.
2. Display a subtle skeleton loader over the album art.
3. If buffer exceeds 5 seconds, attempt to lower the requested video quality parameter (`vq=small`).
4. If iframe throws Error 150 (embed disabled), immediately fetch a proxy stream or skip to the next track.

### Edge Case 17: Handling Audio/Video Desync or Network Drop (Scenario 17)
**Condition:** User is on a 3G network and the YouTube iframe emits `BUFFERING` for more than 1700ms.
**Resolution Strategy:**
1. Pause the global `progressMs` timer.
2. Display a subtle skeleton loader over the album art.
3. If buffer exceeds 5 seconds, attempt to lower the requested video quality parameter (`vq=small`).
4. If iframe throws Error 150 (embed disabled), immediately fetch a proxy stream or skip to the next track.

### Edge Case 18: Handling Audio/Video Desync or Network Drop (Scenario 18)
**Condition:** User is on a 3G network and the YouTube iframe emits `BUFFERING` for more than 1800ms.
**Resolution Strategy:**
1. Pause the global `progressMs` timer.
2. Display a subtle skeleton loader over the album art.
3. If buffer exceeds 5 seconds, attempt to lower the requested video quality parameter (`vq=small`).
4. If iframe throws Error 150 (embed disabled), immediately fetch a proxy stream or skip to the next track.

### Edge Case 19: Handling Audio/Video Desync or Network Drop (Scenario 19)
**Condition:** User is on a 3G network and the YouTube iframe emits `BUFFERING` for more than 1900ms.
**Resolution Strategy:**
1. Pause the global `progressMs` timer.
2. Display a subtle skeleton loader over the album art.
3. If buffer exceeds 5 seconds, attempt to lower the requested video quality parameter (`vq=small`).
4. If iframe throws Error 150 (embed disabled), immediately fetch a proxy stream or skip to the next track.

### Edge Case 20: Handling Audio/Video Desync or Network Drop (Scenario 20)
**Condition:** User is on a 3G network and the YouTube iframe emits `BUFFERING` for more than 2000ms.
**Resolution Strategy:**
1. Pause the global `progressMs` timer.
2. Display a subtle skeleton loader over the album art.
3. If buffer exceeds 5 seconds, attempt to lower the requested video quality parameter (`vq=small`).
4. If iframe throws Error 150 (embed disabled), immediately fetch a proxy stream or skip to the next track.

### Edge Case 21: Handling Audio/Video Desync or Network Drop (Scenario 21)
**Condition:** User is on a 3G network and the YouTube iframe emits `BUFFERING` for more than 2100ms.
**Resolution Strategy:**
1. Pause the global `progressMs` timer.
2. Display a subtle skeleton loader over the album art.
3. If buffer exceeds 5 seconds, attempt to lower the requested video quality parameter (`vq=small`).
4. If iframe throws Error 150 (embed disabled), immediately fetch a proxy stream or skip to the next track.

### Edge Case 22: Handling Audio/Video Desync or Network Drop (Scenario 22)
**Condition:** User is on a 3G network and the YouTube iframe emits `BUFFERING` for more than 2200ms.
**Resolution Strategy:**
1. Pause the global `progressMs` timer.
2. Display a subtle skeleton loader over the album art.
3. If buffer exceeds 5 seconds, attempt to lower the requested video quality parameter (`vq=small`).
4. If iframe throws Error 150 (embed disabled), immediately fetch a proxy stream or skip to the next track.

### Edge Case 23: Handling Audio/Video Desync or Network Drop (Scenario 23)
**Condition:** User is on a 3G network and the YouTube iframe emits `BUFFERING` for more than 2300ms.
**Resolution Strategy:**
1. Pause the global `progressMs` timer.
2. Display a subtle skeleton loader over the album art.
3. If buffer exceeds 5 seconds, attempt to lower the requested video quality parameter (`vq=small`).
4. If iframe throws Error 150 (embed disabled), immediately fetch a proxy stream or skip to the next track.

### Edge Case 24: Handling Audio/Video Desync or Network Drop (Scenario 24)
**Condition:** User is on a 3G network and the YouTube iframe emits `BUFFERING` for more than 2400ms.
**Resolution Strategy:**
1. Pause the global `progressMs` timer.
2. Display a subtle skeleton loader over the album art.
3. If buffer exceeds 5 seconds, attempt to lower the requested video quality parameter (`vq=small`).
4. If iframe throws Error 150 (embed disabled), immediately fetch a proxy stream or skip to the next track.

### Edge Case 25: Handling Audio/Video Desync or Network Drop (Scenario 25)
**Condition:** User is on a 3G network and the YouTube iframe emits `BUFFERING` for more than 2500ms.
**Resolution Strategy:**
1. Pause the global `progressMs` timer.
2. Display a subtle skeleton loader over the album art.
3. If buffer exceeds 5 seconds, attempt to lower the requested video quality parameter (`vq=small`).
4. If iframe throws Error 150 (embed disabled), immediately fetch a proxy stream or skip to the next track.

### Edge Case 26: Handling Audio/Video Desync or Network Drop (Scenario 26)
**Condition:** User is on a 3G network and the YouTube iframe emits `BUFFERING` for more than 2600ms.
**Resolution Strategy:**
1. Pause the global `progressMs` timer.
2. Display a subtle skeleton loader over the album art.
3. If buffer exceeds 5 seconds, attempt to lower the requested video quality parameter (`vq=small`).
4. If iframe throws Error 150 (embed disabled), immediately fetch a proxy stream or skip to the next track.

### Edge Case 27: Handling Audio/Video Desync or Network Drop (Scenario 27)
**Condition:** User is on a 3G network and the YouTube iframe emits `BUFFERING` for more than 2700ms.
**Resolution Strategy:**
1. Pause the global `progressMs` timer.
2. Display a subtle skeleton loader over the album art.
3. If buffer exceeds 5 seconds, attempt to lower the requested video quality parameter (`vq=small`).
4. If iframe throws Error 150 (embed disabled), immediately fetch a proxy stream or skip to the next track.

### Edge Case 28: Handling Audio/Video Desync or Network Drop (Scenario 28)
**Condition:** User is on a 3G network and the YouTube iframe emits `BUFFERING` for more than 2800ms.
**Resolution Strategy:**
1. Pause the global `progressMs` timer.
2. Display a subtle skeleton loader over the album art.
3. If buffer exceeds 5 seconds, attempt to lower the requested video quality parameter (`vq=small`).
4. If iframe throws Error 150 (embed disabled), immediately fetch a proxy stream or skip to the next track.

### Edge Case 29: Handling Audio/Video Desync or Network Drop (Scenario 29)
**Condition:** User is on a 3G network and the YouTube iframe emits `BUFFERING` for more than 2900ms.
**Resolution Strategy:**
1. Pause the global `progressMs` timer.
2. Display a subtle skeleton loader over the album art.
3. If buffer exceeds 5 seconds, attempt to lower the requested video quality parameter (`vq=small`).
4. If iframe throws Error 150 (embed disabled), immediately fetch a proxy stream or skip to the next track.

### Edge Case 30: Handling Audio/Video Desync or Network Drop (Scenario 30)
**Condition:** User is on a 3G network and the YouTube iframe emits `BUFFERING` for more than 3000ms.
**Resolution Strategy:**
1. Pause the global `progressMs` timer.
2. Display a subtle skeleton loader over the album art.
3. If buffer exceeds 5 seconds, attempt to lower the requested video quality parameter (`vq=small`).
4. If iframe throws Error 150 (embed disabled), immediately fetch a proxy stream or skip to the next track.

### Edge Case 31: Handling Audio/Video Desync or Network Drop (Scenario 31)
**Condition:** User is on a 3G network and the YouTube iframe emits `BUFFERING` for more than 3100ms.
**Resolution Strategy:**
1. Pause the global `progressMs` timer.
2. Display a subtle skeleton loader over the album art.
3. If buffer exceeds 5 seconds, attempt to lower the requested video quality parameter (`vq=small`).
4. If iframe throws Error 150 (embed disabled), immediately fetch a proxy stream or skip to the next track.

### Edge Case 32: Handling Audio/Video Desync or Network Drop (Scenario 32)
**Condition:** User is on a 3G network and the YouTube iframe emits `BUFFERING` for more than 3200ms.
**Resolution Strategy:**
1. Pause the global `progressMs` timer.
2. Display a subtle skeleton loader over the album art.
3. If buffer exceeds 5 seconds, attempt to lower the requested video quality parameter (`vq=small`).
4. If iframe throws Error 150 (embed disabled), immediately fetch a proxy stream or skip to the next track.

### Edge Case 33: Handling Audio/Video Desync or Network Drop (Scenario 33)
**Condition:** User is on a 3G network and the YouTube iframe emits `BUFFERING` for more than 3300ms.
**Resolution Strategy:**
1. Pause the global `progressMs` timer.
2. Display a subtle skeleton loader over the album art.
3. If buffer exceeds 5 seconds, attempt to lower the requested video quality parameter (`vq=small`).
4. If iframe throws Error 150 (embed disabled), immediately fetch a proxy stream or skip to the next track.

### Edge Case 34: Handling Audio/Video Desync or Network Drop (Scenario 34)
**Condition:** User is on a 3G network and the YouTube iframe emits `BUFFERING` for more than 3400ms.
**Resolution Strategy:**
1. Pause the global `progressMs` timer.
2. Display a subtle skeleton loader over the album art.
3. If buffer exceeds 5 seconds, attempt to lower the requested video quality parameter (`vq=small`).
4. If iframe throws Error 150 (embed disabled), immediately fetch a proxy stream or skip to the next track.

### Edge Case 35: Handling Audio/Video Desync or Network Drop (Scenario 35)
**Condition:** User is on a 3G network and the YouTube iframe emits `BUFFERING` for more than 3500ms.
**Resolution Strategy:**
1. Pause the global `progressMs` timer.
2. Display a subtle skeleton loader over the album art.
3. If buffer exceeds 5 seconds, attempt to lower the requested video quality parameter (`vq=small`).
4. If iframe throws Error 150 (embed disabled), immediately fetch a proxy stream or skip to the next track.

### Edge Case 36: Handling Audio/Video Desync or Network Drop (Scenario 36)
**Condition:** User is on a 3G network and the YouTube iframe emits `BUFFERING` for more than 3600ms.
**Resolution Strategy:**
1. Pause the global `progressMs` timer.
2. Display a subtle skeleton loader over the album art.
3. If buffer exceeds 5 seconds, attempt to lower the requested video quality parameter (`vq=small`).
4. If iframe throws Error 150 (embed disabled), immediately fetch a proxy stream or skip to the next track.

### Edge Case 37: Handling Audio/Video Desync or Network Drop (Scenario 37)
**Condition:** User is on a 3G network and the YouTube iframe emits `BUFFERING` for more than 3700ms.
**Resolution Strategy:**
1. Pause the global `progressMs` timer.
2. Display a subtle skeleton loader over the album art.
3. If buffer exceeds 5 seconds, attempt to lower the requested video quality parameter (`vq=small`).
4. If iframe throws Error 150 (embed disabled), immediately fetch a proxy stream or skip to the next track.

### Edge Case 38: Handling Audio/Video Desync or Network Drop (Scenario 38)
**Condition:** User is on a 3G network and the YouTube iframe emits `BUFFERING` for more than 3800ms.
**Resolution Strategy:**
1. Pause the global `progressMs` timer.
2. Display a subtle skeleton loader over the album art.
3. If buffer exceeds 5 seconds, attempt to lower the requested video quality parameter (`vq=small`).
4. If iframe throws Error 150 (embed disabled), immediately fetch a proxy stream or skip to the next track.

### Edge Case 39: Handling Audio/Video Desync or Network Drop (Scenario 39)
**Condition:** User is on a 3G network and the YouTube iframe emits `BUFFERING` for more than 3900ms.
**Resolution Strategy:**
1. Pause the global `progressMs` timer.
2. Display a subtle skeleton loader over the album art.
3. If buffer exceeds 5 seconds, attempt to lower the requested video quality parameter (`vq=small`).
4. If iframe throws Error 150 (embed disabled), immediately fetch a proxy stream or skip to the next track.

### Edge Case 40: Handling Audio/Video Desync or Network Drop (Scenario 40)
**Condition:** User is on a 3G network and the YouTube iframe emits `BUFFERING` for more than 4000ms.
**Resolution Strategy:**
1. Pause the global `progressMs` timer.
2. Display a subtle skeleton loader over the album art.
3. If buffer exceeds 5 seconds, attempt to lower the requested video quality parameter (`vq=small`).
4. If iframe throws Error 150 (embed disabled), immediately fetch a proxy stream or skip to the next track.

### Edge Case 41: Handling Audio/Video Desync or Network Drop (Scenario 41)
**Condition:** User is on a 3G network and the YouTube iframe emits `BUFFERING` for more than 4100ms.
**Resolution Strategy:**
1. Pause the global `progressMs` timer.
2. Display a subtle skeleton loader over the album art.
3. If buffer exceeds 5 seconds, attempt to lower the requested video quality parameter (`vq=small`).
4. If iframe throws Error 150 (embed disabled), immediately fetch a proxy stream or skip to the next track.

### Edge Case 42: Handling Audio/Video Desync or Network Drop (Scenario 42)
**Condition:** User is on a 3G network and the YouTube iframe emits `BUFFERING` for more than 4200ms.
**Resolution Strategy:**
1. Pause the global `progressMs` timer.
2. Display a subtle skeleton loader over the album art.
3. If buffer exceeds 5 seconds, attempt to lower the requested video quality parameter (`vq=small`).
4. If iframe throws Error 150 (embed disabled), immediately fetch a proxy stream or skip to the next track.

### Edge Case 43: Handling Audio/Video Desync or Network Drop (Scenario 43)
**Condition:** User is on a 3G network and the YouTube iframe emits `BUFFERING` for more than 4300ms.
**Resolution Strategy:**
1. Pause the global `progressMs` timer.
2. Display a subtle skeleton loader over the album art.
3. If buffer exceeds 5 seconds, attempt to lower the requested video quality parameter (`vq=small`).
4. If iframe throws Error 150 (embed disabled), immediately fetch a proxy stream or skip to the next track.

### Edge Case 44: Handling Audio/Video Desync or Network Drop (Scenario 44)
**Condition:** User is on a 3G network and the YouTube iframe emits `BUFFERING` for more than 4400ms.
**Resolution Strategy:**
1. Pause the global `progressMs` timer.
2. Display a subtle skeleton loader over the album art.
3. If buffer exceeds 5 seconds, attempt to lower the requested video quality parameter (`vq=small`).
4. If iframe throws Error 150 (embed disabled), immediately fetch a proxy stream or skip to the next track.

### Edge Case 45: Handling Audio/Video Desync or Network Drop (Scenario 45)
**Condition:** User is on a 3G network and the YouTube iframe emits `BUFFERING` for more than 4500ms.
**Resolution Strategy:**
1. Pause the global `progressMs` timer.
2. Display a subtle skeleton loader over the album art.
3. If buffer exceeds 5 seconds, attempt to lower the requested video quality parameter (`vq=small`).
4. If iframe throws Error 150 (embed disabled), immediately fetch a proxy stream or skip to the next track.

### Edge Case 46: Handling Audio/Video Desync or Network Drop (Scenario 46)
**Condition:** User is on a 3G network and the YouTube iframe emits `BUFFERING` for more than 4600ms.
**Resolution Strategy:**
1. Pause the global `progressMs` timer.
2. Display a subtle skeleton loader over the album art.
3. If buffer exceeds 5 seconds, attempt to lower the requested video quality parameter (`vq=small`).
4. If iframe throws Error 150 (embed disabled), immediately fetch a proxy stream or skip to the next track.

### Edge Case 47: Handling Audio/Video Desync or Network Drop (Scenario 47)
**Condition:** User is on a 3G network and the YouTube iframe emits `BUFFERING` for more than 4700ms.
**Resolution Strategy:**
1. Pause the global `progressMs` timer.
2. Display a subtle skeleton loader over the album art.
3. If buffer exceeds 5 seconds, attempt to lower the requested video quality parameter (`vq=small`).
4. If iframe throws Error 150 (embed disabled), immediately fetch a proxy stream or skip to the next track.

### Edge Case 48: Handling Audio/Video Desync or Network Drop (Scenario 48)
**Condition:** User is on a 3G network and the YouTube iframe emits `BUFFERING` for more than 4800ms.
**Resolution Strategy:**
1. Pause the global `progressMs` timer.
2. Display a subtle skeleton loader over the album art.
3. If buffer exceeds 5 seconds, attempt to lower the requested video quality parameter (`vq=small`).
4. If iframe throws Error 150 (embed disabled), immediately fetch a proxy stream or skip to the next track.

### Edge Case 49: Handling Audio/Video Desync or Network Drop (Scenario 49)
**Condition:** User is on a 3G network and the YouTube iframe emits `BUFFERING` for more than 4900ms.
**Resolution Strategy:**
1. Pause the global `progressMs` timer.
2. Display a subtle skeleton loader over the album art.
3. If buffer exceeds 5 seconds, attempt to lower the requested video quality parameter (`vq=small`).
4. If iframe throws Error 150 (embed disabled), immediately fetch a proxy stream or skip to the next track.

### Edge Case 50: Handling Audio/Video Desync or Network Drop (Scenario 50)
**Condition:** User is on a 3G network and the YouTube iframe emits `BUFFERING` for more than 5000ms.
**Resolution Strategy:**
1. Pause the global `progressMs` timer.
2. Display a subtle skeleton loader over the album art.
3. If buffer exceeds 5 seconds, attempt to lower the requested video quality parameter (`vq=small`).
4. If iframe throws Error 150 (embed disabled), immediately fetch a proxy stream or skip to the next track.

### Edge Case 51: Handling Audio/Video Desync or Network Drop (Scenario 51)
**Condition:** User is on a 3G network and the YouTube iframe emits `BUFFERING` for more than 5100ms.
**Resolution Strategy:**
1. Pause the global `progressMs` timer.
2. Display a subtle skeleton loader over the album art.
3. If buffer exceeds 5 seconds, attempt to lower the requested video quality parameter (`vq=small`).
4. If iframe throws Error 150 (embed disabled), immediately fetch a proxy stream or skip to the next track.

### Edge Case 52: Handling Audio/Video Desync or Network Drop (Scenario 52)
**Condition:** User is on a 3G network and the YouTube iframe emits `BUFFERING` for more than 5200ms.
**Resolution Strategy:**
1. Pause the global `progressMs` timer.
2. Display a subtle skeleton loader over the album art.
3. If buffer exceeds 5 seconds, attempt to lower the requested video quality parameter (`vq=small`).
4. If iframe throws Error 150 (embed disabled), immediately fetch a proxy stream or skip to the next track.

### Edge Case 53: Handling Audio/Video Desync or Network Drop (Scenario 53)
**Condition:** User is on a 3G network and the YouTube iframe emits `BUFFERING` for more than 5300ms.
**Resolution Strategy:**
1. Pause the global `progressMs` timer.
2. Display a subtle skeleton loader over the album art.
3. If buffer exceeds 5 seconds, attempt to lower the requested video quality parameter (`vq=small`).
4. If iframe throws Error 150 (embed disabled), immediately fetch a proxy stream or skip to the next track.

### Edge Case 54: Handling Audio/Video Desync or Network Drop (Scenario 54)
**Condition:** User is on a 3G network and the YouTube iframe emits `BUFFERING` for more than 5400ms.
**Resolution Strategy:**
1. Pause the global `progressMs` timer.
2. Display a subtle skeleton loader over the album art.
3. If buffer exceeds 5 seconds, attempt to lower the requested video quality parameter (`vq=small`).
4. If iframe throws Error 150 (embed disabled), immediately fetch a proxy stream or skip to the next track.

### Edge Case 55: Handling Audio/Video Desync or Network Drop (Scenario 55)
**Condition:** User is on a 3G network and the YouTube iframe emits `BUFFERING` for more than 5500ms.
**Resolution Strategy:**
1. Pause the global `progressMs` timer.
2. Display a subtle skeleton loader over the album art.
3. If buffer exceeds 5 seconds, attempt to lower the requested video quality parameter (`vq=small`).
4. If iframe throws Error 150 (embed disabled), immediately fetch a proxy stream or skip to the next track.

### Edge Case 56: Handling Audio/Video Desync or Network Drop (Scenario 56)
**Condition:** User is on a 3G network and the YouTube iframe emits `BUFFERING` for more than 5600ms.
**Resolution Strategy:**
1. Pause the global `progressMs` timer.
2. Display a subtle skeleton loader over the album art.
3. If buffer exceeds 5 seconds, attempt to lower the requested video quality parameter (`vq=small`).
4. If iframe throws Error 150 (embed disabled), immediately fetch a proxy stream or skip to the next track.

### Edge Case 57: Handling Audio/Video Desync or Network Drop (Scenario 57)
**Condition:** User is on a 3G network and the YouTube iframe emits `BUFFERING` for more than 5700ms.
**Resolution Strategy:**
1. Pause the global `progressMs` timer.
2. Display a subtle skeleton loader over the album art.
3. If buffer exceeds 5 seconds, attempt to lower the requested video quality parameter (`vq=small`).
4. If iframe throws Error 150 (embed disabled), immediately fetch a proxy stream or skip to the next track.

### Edge Case 58: Handling Audio/Video Desync or Network Drop (Scenario 58)
**Condition:** User is on a 3G network and the YouTube iframe emits `BUFFERING` for more than 5800ms.
**Resolution Strategy:**
1. Pause the global `progressMs` timer.
2. Display a subtle skeleton loader over the album art.
3. If buffer exceeds 5 seconds, attempt to lower the requested video quality parameter (`vq=small`).
4. If iframe throws Error 150 (embed disabled), immediately fetch a proxy stream or skip to the next track.

### Edge Case 59: Handling Audio/Video Desync or Network Drop (Scenario 59)
**Condition:** User is on a 3G network and the YouTube iframe emits `BUFFERING` for more than 5900ms.
**Resolution Strategy:**
1. Pause the global `progressMs` timer.
2. Display a subtle skeleton loader over the album art.
3. If buffer exceeds 5 seconds, attempt to lower the requested video quality parameter (`vq=small`).
4. If iframe throws Error 150 (embed disabled), immediately fetch a proxy stream or skip to the next track.

### Edge Case 60: Handling Audio/Video Desync or Network Drop (Scenario 60)
**Condition:** User is on a 3G network and the YouTube iframe emits `BUFFERING` for more than 6000ms.
**Resolution Strategy:**
1. Pause the global `progressMs` timer.
2. Display a subtle skeleton loader over the album art.
3. If buffer exceeds 5 seconds, attempt to lower the requested video quality parameter (`vq=small`).
4. If iframe throws Error 150 (embed disabled), immediately fetch a proxy stream or skip to the next track.

### Edge Case 61: Handling Audio/Video Desync or Network Drop (Scenario 61)
**Condition:** User is on a 3G network and the YouTube iframe emits `BUFFERING` for more than 6100ms.
**Resolution Strategy:**
1. Pause the global `progressMs` timer.
2. Display a subtle skeleton loader over the album art.
3. If buffer exceeds 5 seconds, attempt to lower the requested video quality parameter (`vq=small`).
4. If iframe throws Error 150 (embed disabled), immediately fetch a proxy stream or skip to the next track.

### Edge Case 62: Handling Audio/Video Desync or Network Drop (Scenario 62)
**Condition:** User is on a 3G network and the YouTube iframe emits `BUFFERING` for more than 6200ms.
**Resolution Strategy:**
1. Pause the global `progressMs` timer.
2. Display a subtle skeleton loader over the album art.
3. If buffer exceeds 5 seconds, attempt to lower the requested video quality parameter (`vq=small`).
4. If iframe throws Error 150 (embed disabled), immediately fetch a proxy stream or skip to the next track.

### Edge Case 63: Handling Audio/Video Desync or Network Drop (Scenario 63)
**Condition:** User is on a 3G network and the YouTube iframe emits `BUFFERING` for more than 6300ms.
**Resolution Strategy:**
1. Pause the global `progressMs` timer.
2. Display a subtle skeleton loader over the album art.
3. If buffer exceeds 5 seconds, attempt to lower the requested video quality parameter (`vq=small`).
4. If iframe throws Error 150 (embed disabled), immediately fetch a proxy stream or skip to the next track.

### Edge Case 64: Handling Audio/Video Desync or Network Drop (Scenario 64)
**Condition:** User is on a 3G network and the YouTube iframe emits `BUFFERING` for more than 6400ms.
**Resolution Strategy:**
1. Pause the global `progressMs` timer.
2. Display a subtle skeleton loader over the album art.
3. If buffer exceeds 5 seconds, attempt to lower the requested video quality parameter (`vq=small`).
4. If iframe throws Error 150 (embed disabled), immediately fetch a proxy stream or skip to the next track.

### Edge Case 65: Handling Audio/Video Desync or Network Drop (Scenario 65)
**Condition:** User is on a 3G network and the YouTube iframe emits `BUFFERING` for more than 6500ms.
**Resolution Strategy:**
1. Pause the global `progressMs` timer.
2. Display a subtle skeleton loader over the album art.
3. If buffer exceeds 5 seconds, attempt to lower the requested video quality parameter (`vq=small`).
4. If iframe throws Error 150 (embed disabled), immediately fetch a proxy stream or skip to the next track.

### Edge Case 66: Handling Audio/Video Desync or Network Drop (Scenario 66)
**Condition:** User is on a 3G network and the YouTube iframe emits `BUFFERING` for more than 6600ms.
**Resolution Strategy:**
1. Pause the global `progressMs` timer.
2. Display a subtle skeleton loader over the album art.
3. If buffer exceeds 5 seconds, attempt to lower the requested video quality parameter (`vq=small`).
4. If iframe throws Error 150 (embed disabled), immediately fetch a proxy stream or skip to the next track.

### Edge Case 67: Handling Audio/Video Desync or Network Drop (Scenario 67)
**Condition:** User is on a 3G network and the YouTube iframe emits `BUFFERING` for more than 6700ms.
**Resolution Strategy:**
1. Pause the global `progressMs` timer.
2. Display a subtle skeleton loader over the album art.
3. If buffer exceeds 5 seconds, attempt to lower the requested video quality parameter (`vq=small`).
4. If iframe throws Error 150 (embed disabled), immediately fetch a proxy stream or skip to the next track.

### Edge Case 68: Handling Audio/Video Desync or Network Drop (Scenario 68)
**Condition:** User is on a 3G network and the YouTube iframe emits `BUFFERING` for more than 6800ms.
**Resolution Strategy:**
1. Pause the global `progressMs` timer.
2. Display a subtle skeleton loader over the album art.
3. If buffer exceeds 5 seconds, attempt to lower the requested video quality parameter (`vq=small`).
4. If iframe throws Error 150 (embed disabled), immediately fetch a proxy stream or skip to the next track.

### Edge Case 69: Handling Audio/Video Desync or Network Drop (Scenario 69)
**Condition:** User is on a 3G network and the YouTube iframe emits `BUFFERING` for more than 6900ms.
**Resolution Strategy:**
1. Pause the global `progressMs` timer.
2. Display a subtle skeleton loader over the album art.
3. If buffer exceeds 5 seconds, attempt to lower the requested video quality parameter (`vq=small`).
4. If iframe throws Error 150 (embed disabled), immediately fetch a proxy stream or skip to the next track.

### Edge Case 70: Handling Audio/Video Desync or Network Drop (Scenario 70)
**Condition:** User is on a 3G network and the YouTube iframe emits `BUFFERING` for more than 7000ms.
**Resolution Strategy:**
1. Pause the global `progressMs` timer.
2. Display a subtle skeleton loader over the album art.
3. If buffer exceeds 5 seconds, attempt to lower the requested video quality parameter (`vq=small`).
4. If iframe throws Error 150 (embed disabled), immediately fetch a proxy stream or skip to the next track.

### Edge Case 71: Handling Audio/Video Desync or Network Drop (Scenario 71)
**Condition:** User is on a 3G network and the YouTube iframe emits `BUFFERING` for more than 7100ms.
**Resolution Strategy:**
1. Pause the global `progressMs` timer.
2. Display a subtle skeleton loader over the album art.
3. If buffer exceeds 5 seconds, attempt to lower the requested video quality parameter (`vq=small`).
4. If iframe throws Error 150 (embed disabled), immediately fetch a proxy stream or skip to the next track.

### Edge Case 72: Handling Audio/Video Desync or Network Drop (Scenario 72)
**Condition:** User is on a 3G network and the YouTube iframe emits `BUFFERING` for more than 7200ms.
**Resolution Strategy:**
1. Pause the global `progressMs` timer.
2. Display a subtle skeleton loader over the album art.
3. If buffer exceeds 5 seconds, attempt to lower the requested video quality parameter (`vq=small`).
4. If iframe throws Error 150 (embed disabled), immediately fetch a proxy stream or skip to the next track.

### Edge Case 73: Handling Audio/Video Desync or Network Drop (Scenario 73)
**Condition:** User is on a 3G network and the YouTube iframe emits `BUFFERING` for more than 7300ms.
**Resolution Strategy:**
1. Pause the global `progressMs` timer.
2. Display a subtle skeleton loader over the album art.
3. If buffer exceeds 5 seconds, attempt to lower the requested video quality parameter (`vq=small`).
4. If iframe throws Error 150 (embed disabled), immediately fetch a proxy stream or skip to the next track.

### Edge Case 74: Handling Audio/Video Desync or Network Drop (Scenario 74)
**Condition:** User is on a 3G network and the YouTube iframe emits `BUFFERING` for more than 7400ms.
**Resolution Strategy:**
1. Pause the global `progressMs` timer.
2. Display a subtle skeleton loader over the album art.
3. If buffer exceeds 5 seconds, attempt to lower the requested video quality parameter (`vq=small`).
4. If iframe throws Error 150 (embed disabled), immediately fetch a proxy stream or skip to the next track.

### Edge Case 75: Handling Audio/Video Desync or Network Drop (Scenario 75)
**Condition:** User is on a 3G network and the YouTube iframe emits `BUFFERING` for more than 7500ms.
**Resolution Strategy:**
1. Pause the global `progressMs` timer.
2. Display a subtle skeleton loader over the album art.
3. If buffer exceeds 5 seconds, attempt to lower the requested video quality parameter (`vq=small`).
4. If iframe throws Error 150 (embed disabled), immediately fetch a proxy stream or skip to the next track.

### Edge Case 76: Handling Audio/Video Desync or Network Drop (Scenario 76)
**Condition:** User is on a 3G network and the YouTube iframe emits `BUFFERING` for more than 7600ms.
**Resolution Strategy:**
1. Pause the global `progressMs` timer.
2. Display a subtle skeleton loader over the album art.
3. If buffer exceeds 5 seconds, attempt to lower the requested video quality parameter (`vq=small`).
4. If iframe throws Error 150 (embed disabled), immediately fetch a proxy stream or skip to the next track.

### Edge Case 77: Handling Audio/Video Desync or Network Drop (Scenario 77)
**Condition:** User is on a 3G network and the YouTube iframe emits `BUFFERING` for more than 7700ms.
**Resolution Strategy:**
1. Pause the global `progressMs` timer.
2. Display a subtle skeleton loader over the album art.
3. If buffer exceeds 5 seconds, attempt to lower the requested video quality parameter (`vq=small`).
4. If iframe throws Error 150 (embed disabled), immediately fetch a proxy stream or skip to the next track.

### Edge Case 78: Handling Audio/Video Desync or Network Drop (Scenario 78)
**Condition:** User is on a 3G network and the YouTube iframe emits `BUFFERING` for more than 7800ms.
**Resolution Strategy:**
1. Pause the global `progressMs` timer.
2. Display a subtle skeleton loader over the album art.
3. If buffer exceeds 5 seconds, attempt to lower the requested video quality parameter (`vq=small`).
4. If iframe throws Error 150 (embed disabled), immediately fetch a proxy stream or skip to the next track.

### Edge Case 79: Handling Audio/Video Desync or Network Drop (Scenario 79)
**Condition:** User is on a 3G network and the YouTube iframe emits `BUFFERING` for more than 7900ms.
**Resolution Strategy:**
1. Pause the global `progressMs` timer.
2. Display a subtle skeleton loader over the album art.
3. If buffer exceeds 5 seconds, attempt to lower the requested video quality parameter (`vq=small`).
4. If iframe throws Error 150 (embed disabled), immediately fetch a proxy stream or skip to the next track.

### Edge Case 80: Handling Audio/Video Desync or Network Drop (Scenario 80)
**Condition:** User is on a 3G network and the YouTube iframe emits `BUFFERING` for more than 8000ms.
**Resolution Strategy:**
1. Pause the global `progressMs` timer.
2. Display a subtle skeleton loader over the album art.
3. If buffer exceeds 5 seconds, attempt to lower the requested video quality parameter (`vq=small`).
4. If iframe throws Error 150 (embed disabled), immediately fetch a proxy stream or skip to the next track.

### Edge Case 81: Handling Audio/Video Desync or Network Drop (Scenario 81)
**Condition:** User is on a 3G network and the YouTube iframe emits `BUFFERING` for more than 8100ms.
**Resolution Strategy:**
1. Pause the global `progressMs` timer.
2. Display a subtle skeleton loader over the album art.
3. If buffer exceeds 5 seconds, attempt to lower the requested video quality parameter (`vq=small`).
4. If iframe throws Error 150 (embed disabled), immediately fetch a proxy stream or skip to the next track.

### Edge Case 82: Handling Audio/Video Desync or Network Drop (Scenario 82)
**Condition:** User is on a 3G network and the YouTube iframe emits `BUFFERING` for more than 8200ms.
**Resolution Strategy:**
1. Pause the global `progressMs` timer.
2. Display a subtle skeleton loader over the album art.
3. If buffer exceeds 5 seconds, attempt to lower the requested video quality parameter (`vq=small`).
4. If iframe throws Error 150 (embed disabled), immediately fetch a proxy stream or skip to the next track.

### Edge Case 83: Handling Audio/Video Desync or Network Drop (Scenario 83)
**Condition:** User is on a 3G network and the YouTube iframe emits `BUFFERING` for more than 8300ms.
**Resolution Strategy:**
1. Pause the global `progressMs` timer.
2. Display a subtle skeleton loader over the album art.
3. If buffer exceeds 5 seconds, attempt to lower the requested video quality parameter (`vq=small`).
4. If iframe throws Error 150 (embed disabled), immediately fetch a proxy stream or skip to the next track.

### Edge Case 84: Handling Audio/Video Desync or Network Drop (Scenario 84)
**Condition:** User is on a 3G network and the YouTube iframe emits `BUFFERING` for more than 8400ms.
**Resolution Strategy:**
1. Pause the global `progressMs` timer.
2. Display a subtle skeleton loader over the album art.
3. If buffer exceeds 5 seconds, attempt to lower the requested video quality parameter (`vq=small`).
4. If iframe throws Error 150 (embed disabled), immediately fetch a proxy stream or skip to the next track.

### Edge Case 85: Handling Audio/Video Desync or Network Drop (Scenario 85)
**Condition:** User is on a 3G network and the YouTube iframe emits `BUFFERING` for more than 8500ms.
**Resolution Strategy:**
1. Pause the global `progressMs` timer.
2. Display a subtle skeleton loader over the album art.
3. If buffer exceeds 5 seconds, attempt to lower the requested video quality parameter (`vq=small`).
4. If iframe throws Error 150 (embed disabled), immediately fetch a proxy stream or skip to the next track.

### Edge Case 86: Handling Audio/Video Desync or Network Drop (Scenario 86)
**Condition:** User is on a 3G network and the YouTube iframe emits `BUFFERING` for more than 8600ms.
**Resolution Strategy:**
1. Pause the global `progressMs` timer.
2. Display a subtle skeleton loader over the album art.
3. If buffer exceeds 5 seconds, attempt to lower the requested video quality parameter (`vq=small`).
4. If iframe throws Error 150 (embed disabled), immediately fetch a proxy stream or skip to the next track.

### Edge Case 87: Handling Audio/Video Desync or Network Drop (Scenario 87)
**Condition:** User is on a 3G network and the YouTube iframe emits `BUFFERING` for more than 8700ms.
**Resolution Strategy:**
1. Pause the global `progressMs` timer.
2. Display a subtle skeleton loader over the album art.
3. If buffer exceeds 5 seconds, attempt to lower the requested video quality parameter (`vq=small`).
4. If iframe throws Error 150 (embed disabled), immediately fetch a proxy stream or skip to the next track.

### Edge Case 88: Handling Audio/Video Desync or Network Drop (Scenario 88)
**Condition:** User is on a 3G network and the YouTube iframe emits `BUFFERING` for more than 8800ms.
**Resolution Strategy:**
1. Pause the global `progressMs` timer.
2. Display a subtle skeleton loader over the album art.
3. If buffer exceeds 5 seconds, attempt to lower the requested video quality parameter (`vq=small`).
4. If iframe throws Error 150 (embed disabled), immediately fetch a proxy stream or skip to the next track.

### Edge Case 89: Handling Audio/Video Desync or Network Drop (Scenario 89)
**Condition:** User is on a 3G network and the YouTube iframe emits `BUFFERING` for more than 8900ms.
**Resolution Strategy:**
1. Pause the global `progressMs` timer.
2. Display a subtle skeleton loader over the album art.
3. If buffer exceeds 5 seconds, attempt to lower the requested video quality parameter (`vq=small`).
4. If iframe throws Error 150 (embed disabled), immediately fetch a proxy stream or skip to the next track.

### Edge Case 90: Handling Audio/Video Desync or Network Drop (Scenario 90)
**Condition:** User is on a 3G network and the YouTube iframe emits `BUFFERING` for more than 9000ms.
**Resolution Strategy:**
1. Pause the global `progressMs` timer.
2. Display a subtle skeleton loader over the album art.
3. If buffer exceeds 5 seconds, attempt to lower the requested video quality parameter (`vq=small`).
4. If iframe throws Error 150 (embed disabled), immediately fetch a proxy stream or skip to the next track.

### Edge Case 91: Handling Audio/Video Desync or Network Drop (Scenario 91)
**Condition:** User is on a 3G network and the YouTube iframe emits `BUFFERING` for more than 9100ms.
**Resolution Strategy:**
1. Pause the global `progressMs` timer.
2. Display a subtle skeleton loader over the album art.
3. If buffer exceeds 5 seconds, attempt to lower the requested video quality parameter (`vq=small`).
4. If iframe throws Error 150 (embed disabled), immediately fetch a proxy stream or skip to the next track.

### Edge Case 92: Handling Audio/Video Desync or Network Drop (Scenario 92)
**Condition:** User is on a 3G network and the YouTube iframe emits `BUFFERING` for more than 9200ms.
**Resolution Strategy:**
1. Pause the global `progressMs` timer.
2. Display a subtle skeleton loader over the album art.
3. If buffer exceeds 5 seconds, attempt to lower the requested video quality parameter (`vq=small`).
4. If iframe throws Error 150 (embed disabled), immediately fetch a proxy stream or skip to the next track.

### Edge Case 93: Handling Audio/Video Desync or Network Drop (Scenario 93)
**Condition:** User is on a 3G network and the YouTube iframe emits `BUFFERING` for more than 9300ms.
**Resolution Strategy:**
1. Pause the global `progressMs` timer.
2. Display a subtle skeleton loader over the album art.
3. If buffer exceeds 5 seconds, attempt to lower the requested video quality parameter (`vq=small`).
4. If iframe throws Error 150 (embed disabled), immediately fetch a proxy stream or skip to the next track.

### Edge Case 94: Handling Audio/Video Desync or Network Drop (Scenario 94)
**Condition:** User is on a 3G network and the YouTube iframe emits `BUFFERING` for more than 9400ms.
**Resolution Strategy:**
1. Pause the global `progressMs` timer.
2. Display a subtle skeleton loader over the album art.
3. If buffer exceeds 5 seconds, attempt to lower the requested video quality parameter (`vq=small`).
4. If iframe throws Error 150 (embed disabled), immediately fetch a proxy stream or skip to the next track.

### Edge Case 95: Handling Audio/Video Desync or Network Drop (Scenario 95)
**Condition:** User is on a 3G network and the YouTube iframe emits `BUFFERING` for more than 9500ms.
**Resolution Strategy:**
1. Pause the global `progressMs` timer.
2. Display a subtle skeleton loader over the album art.
3. If buffer exceeds 5 seconds, attempt to lower the requested video quality parameter (`vq=small`).
4. If iframe throws Error 150 (embed disabled), immediately fetch a proxy stream or skip to the next track.

### Edge Case 96: Handling Audio/Video Desync or Network Drop (Scenario 96)
**Condition:** User is on a 3G network and the YouTube iframe emits `BUFFERING` for more than 9600ms.
**Resolution Strategy:**
1. Pause the global `progressMs` timer.
2. Display a subtle skeleton loader over the album art.
3. If buffer exceeds 5 seconds, attempt to lower the requested video quality parameter (`vq=small`).
4. If iframe throws Error 150 (embed disabled), immediately fetch a proxy stream or skip to the next track.

### Edge Case 97: Handling Audio/Video Desync or Network Drop (Scenario 97)
**Condition:** User is on a 3G network and the YouTube iframe emits `BUFFERING` for more than 9700ms.
**Resolution Strategy:**
1. Pause the global `progressMs` timer.
2. Display a subtle skeleton loader over the album art.
3. If buffer exceeds 5 seconds, attempt to lower the requested video quality parameter (`vq=small`).
4. If iframe throws Error 150 (embed disabled), immediately fetch a proxy stream or skip to the next track.

### Edge Case 98: Handling Audio/Video Desync or Network Drop (Scenario 98)
**Condition:** User is on a 3G network and the YouTube iframe emits `BUFFERING` for more than 9800ms.
**Resolution Strategy:**
1. Pause the global `progressMs` timer.
2. Display a subtle skeleton loader over the album art.
3. If buffer exceeds 5 seconds, attempt to lower the requested video quality parameter (`vq=small`).
4. If iframe throws Error 150 (embed disabled), immediately fetch a proxy stream or skip to the next track.

### Edge Case 99: Handling Audio/Video Desync or Network Drop (Scenario 99)
**Condition:** User is on a 3G network and the YouTube iframe emits `BUFFERING` for more than 9900ms.
**Resolution Strategy:**
1. Pause the global `progressMs` timer.
2. Display a subtle skeleton loader over the album art.
3. If buffer exceeds 5 seconds, attempt to lower the requested video quality parameter (`vq=small`).
4. If iframe throws Error 150 (embed disabled), immediately fetch a proxy stream or skip to the next track.

### Edge Case 100: Handling Audio/Video Desync or Network Drop (Scenario 100)
**Condition:** User is on a 3G network and the YouTube iframe emits `BUFFERING` for more than 10000ms.
**Resolution Strategy:**
1. Pause the global `progressMs` timer.
2. Display a subtle skeleton loader over the album art.
3. If buffer exceeds 5 seconds, attempt to lower the requested video quality parameter (`vq=small`).
4. If iframe throws Error 150 (embed disabled), immediately fetch a proxy stream or skip to the next track.

## PHASE 6: DEVOPS, SCALING & DEPLOYMENT
We require enterprise-grade deployment specs using Docker, Kubernetes, and GitHub Actions.

### Dockerfile (Web & API)
```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile
COPY . .
RUN yarn build
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV production
COPY --from=builder /app/next.config.js ./
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
EXPOSE 3000
CMD ["node", "server.js"]
```

