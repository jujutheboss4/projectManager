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
