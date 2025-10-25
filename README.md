# Crux

A platform for sharing your most important ideas and beliefs - your "cruxes". Like Twitter but focused on the crucial considerations that shape thinking, inspired by Effective Altruism Forum and LessWrong Shortforms.

## Features

- **Post your cruxes**: Share ideas up to 5000 characters
- **Chronological feed**: See the latest posts in real-time
- **Outer space theme**: Beautiful cosmic design with animated stars
- **Simple authentication**: Sign in with Google
- **No karma/ratings**: Focus on the ideas, not the points

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Set up Firebase

1. Create a Firebase project at [https://console.firebase.google.com](https://console.firebase.google.com)
2. Enable Authentication (Google sign-in)
3. Create a Firestore database
4. Copy your Firebase config
5. Create a `.env` file in the root directory:

```env
VITE_FIREBASE_API_KEY=your_api_key_here
VITE_FIREBASE_AUTH_DOMAIN=your_auth_domain_here
VITE_FIREBASE_PROJECT_ID=your_project_id_here
VITE_FIREBASE_STORAGE_BUCKET=your_storage_bucket_here
VITE_FIREBASE_MESSAGING_SENDER_ID=your_messaging_sender_id_here
VITE_FIREBASE_APP_ID=your_app_id_here
```

### 3. Configure Firestore

In your Firebase console, create a Firestore database with the following collection:

- `posts` collection (will be created automatically when first post is made)

### 4. Run the development server

```bash
npm run dev
```

## Tech Stack

- **React** - UI framework
- **Vite** - Build tool
- **Firebase** - Backend (Firestore & Authentication)
- **Tailwind CSS** - Styling
- **React Router** - Routing

## What is a "Crux"?

A crux is a crucial consideration - a key belief, assumption, or piece of evidence that, if changed, would significantly alter your view on an important topic. It's the foundation of your thinking on matters that shape decisions and beliefs.

## License

MIT
