# ProjectPulse

A lightweight interactive project manager web app designed to run as a static site on GitHub Pages.

## Local preview

Open `index.html` directly in a browser, or serve the folder with any static server.

## Publish to GitHub Pages

1. Create a new GitHub repository and push this folder to the `main` branch.
2. In the repository settings, enable **Pages** and choose **GitHub Actions** as the source.
3. Commit and push to `main`.
4. After the workflow completes, GitHub Pages will provide a public URL.

## Notes

- The app uses only static files, so it works without a build step.
- A `.nojekyll` file is included so GitHub Pages serves the site exactly as-is.

## Repo persistence

The app can persist project and task data to the repository itself by updating [data/projectpulse-state.json](data/projectpulse-state.json).

1. Open the app and click **Sync settings**.
2. Enable repo sync and enter your GitHub owner, repository, branch, path, and a fine-grained token with `contents: write` permission.
3. Save the settings, then create or edit tasks normally.

The browser keeps a local cache too, but the GitHub repo becomes the source of truth once sync is enabled.

Note: the sync connection details you enter in **Sync settings** are stored in your browser, not in the public site. The project/task data is what gets committed into the repo and redeployed through GitHub Pages.
