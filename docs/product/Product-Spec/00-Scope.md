We're building an app for managing films and TV Shows on your local disk as well as playing them. 

## Background
I usually download alot of torrents to watch movies and TvShows. You might be objected to torrenting but I believe this is only a natural response because of the greed of movie industry. I don't like the subscription hell that CVs want users to opt into so as to watch movies. Torrenting is a protest aganist the greed, although its illegal in some countries. 

All in all, that's how I get majority of my movies, but I'd like to improve this a bit. For starters, I'd like a nice site where I can browse my catalog and choose what to watch in one site. I have called that site "Moran" since these are brave warriors who live a simple peaceful life and respect everyone (most importantly nature). The morans like the color Red (Refer to the Kenyan flag for specific hue) with black and white. The site should reflect that.

## User flow
I usually have a directory where my torrents are downloading and once they complete, they are moved to the final directory on my disk. A user will create a profile which is basically a name and path to the location on the disk where movies or tvshows are located. Take "Videos/Movies/Dune 2022/Dune.mkv" I'd create a profile called "Endurance Movies" then point to "Videos/Movies". The app will walk the directory and using the filename as well as the file metadata to search an open source database for details. We will persist that information next to the movie and use that as the display so that we can get posters and other information like actors, plot, rating etc. The app should allow the user to create a profile. Then clicking a profile lists down the video files and clicking on one opens a video player, we can also allow "Open in VLC"

## User Interface
1. We will need a landing page with details of the app
2. A login page for users (with registration as well)
3. After login, the user enters a dashboard
	1. The dashboard has left pane that allows navigation. The default option should be the profiles page.
4. The profile page that shows all the profiles including a button to add profiles. 
	1. Clicking the add profile button should open the form on the right pane.
	2. Clicking a profile should open the explore profile page that shows the movies and tvshows. When the profile page is loading items, it can also load items that are still being "Expanded". ie. We're fetching more details. 
	3. Clicking on an item should open the right pane with details of the show including a button to play the movie.
		1. Sometimes we won't have enough details to automatically infer the movie or tvshow, so on the right pane we show just the details we have locally and a button "Get more details" that will open a search box so that the user can get the movie manually.
5. The dashboard also has a library page that shows all the movies across all profiles.
6. The dashboard also has a watchlist that has a search bar for a specific movie. Items that are on the watchlist and the film is available locally, they should be marked.
7. We also have a setting page where we place settings.
8. We also have a feedback and report bug page.
9. Finally we'll need a design for the video player. It will also have a right pane that overlays and suggests movies (watchlist or next movie in a sequel or similar genres)


We will first build a website first in React. We already have a bun backend service. Later will create a desktop site that will use a Rust backend but bootsrap a chromium instance and render the webpage.