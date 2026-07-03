# Fake X - Zaio Solo Project

A vanilla HTML/CSS/JavaScript X-style timeline clone for the Zaio Project Simulation assignment.

## Highlighted Features

- Core X clone: timeline feed, composer, post prepend, likes, reposts, replies, share, bookmarks, navigation views, profile editing, responsive layout, and localStorage persistence.
- Cursor-assisted feature: media uploads with preview support for inline and modal posts, plus selected feed posts with image media and placeholder media cards.
- Cursor-assisted feature: Following tab and follow/unfollow controls that persist and filter the timeline.
- Manual custom feature: interactive polls. Create a poll from the composer, attach it to a post, vote in the feed, lock one vote per user, and persist poll votes.

## Run Locally

1. Open this folder in VS Code.
2. Use Live Server or any static server.
3. You can also double-click `index.html` for a quick local preview.

## Project Structure

- `index.html`: app markup, views, composer controls, right column, and modals.
- `style.css`: X-style dark layout, responsive rules, media placeholders, poll styling, and right-column footer.
- `script.js`: feed rendering, composer, Cursor-assisted media handling, manual poll feature, interactions, view switching, and persistence.
- `additional.js`: profile editing, explore search/tabs, and notification stub.
- `assests/`: profile images and feed media.

## Loom Demo Notes

- Show a normal post, an image post, and a placeholder media post.
- Show the poll flow: create options, attach the poll, post it, then vote.
- Mention the Cursor-assisted media preview work and Following filter.
- Refresh the page to show localStorage persistence.
