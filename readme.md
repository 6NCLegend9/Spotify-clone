# Music Streamer

This project is a digital music platform, It's made for listening to music and making your favorite music collection. Spotify API is used to get tracks and albums, artists. Spotify API provides millions of music data. This project is made in the MERN stack.

## Features

- Full-Screen Mode
- Password login & Verification Based Sign Up
- Forgot password
- Google Login & Sign up
- Collections Clone & Custom Playlist Create and Edit & With Search Feature in Library
- History
- Search With Filter ( all, artists, albums, tracks)
- Search box allows Spotify Search Query (Example = artist:alan walker )
- Account Edit Option
- On the home page user's recent activity-based recommendation
- Link Copy Feature (Track, Album, Artist)
- Audio (track) Controls
- Light & Dark mode
- Responsive Design
- Only Users Can Play Audio (Tracks)

## Prerequisites

- get your spotify api key from https://developer.spotify.com/documentation/web-api/tutorials/getting-started

Make sure you have installed all of the following prerequisites on your development machine:

- Node Js & Npm [Download and Install](https://nodejs.org/en)
- MongoDB [Download and Install](https://www.mongodb.com/docs/manual/installation/)
- Git [Download and Install](https://git-scm.com/downloads)

## Technology Used

#vite #reactjs #scss #redux-toolkit

#nodejs #expressjs #mongodb #jsonwebtoken authentication

#javascript

#api

#spotify #music platform

## Environment Variables

To run this project, you will need to add the following environment variables to your .env file in server directory

`PORT` = `5000`

`MONGODB_URI`

`MONGODB_DB_NAME` #Database name, for example `musicon`

`SITE_URL`

`JWT_SECRET`

`SPOTIFY_CLIENT_ID`

`SPOTIFY_CLIENT_SECRET`

`MAIL_EMAIL` #Optional; required for signup and password-reset emails

`MAIL_SECRET` #Optional; required for signup and password-reset emails

`MAIL_HOST` #Optional; defaults to `smtp.gmail.com`

`MAIL_PORT` #Optional; defaults to `465`

`MAIL_SECURE` #Optional; defaults to `true`; use `false` with port `587`

To run this project, you will need to add the following environment variables to your .env.local file in client directory

`VITE_GOOGLE_CLIENT` #Google login api client id

## Run Locally


##To Start BackEnd

Go to the server directory

```bash
  cd Music-Streamer/server
```

Install dependencies

```bash
  npm install
```

Start

```bash
  npm start
```

##To Start FrontEnd

Go to the client directory

```bash
  cd Music-Streamer/client
```

Install dependencies

```bash
  npm install
```

Start

```bash
  npm run dev
```

## Deploy to Vercel

Import this repository into Vercel with the project root set to the repository root. The included `vercel.json` builds the client and routes `/api/*` to the Express serverless function.

Add these environment variables in Vercel Project Settings:

`MONGODB_URI`

`MONGODB_DB_NAME`

`JWT_SECRET`

`SITE_URL` #The deployed frontend URL

`MAIL_EMAIL` #Optional; required for signup and password-reset emails

`MAIL_SECRET` #Optional; required for signup and password-reset emails
