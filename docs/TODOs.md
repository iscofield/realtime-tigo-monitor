## updates
We have an existing readme, but I want to enhance this to make it far richer in details and highlight the functionality.  The key things I want it to include:
- multiple screenshots demonstrating different aspects of the app (the layout view, the tabular view, the editor view, the setup wizard, etc.)
- a nice list of all the features (upload your own image, layout editor, view realtime data (5-10s), show panel wattage / voltage on your layout)
- list of all data fields provided per panel (based on tigo data)
- include deployment instructions (clone the repo, deploy the tigo data collector, then deploy the backend/frontend, etc.)
    - we can update the readme to no logner list the required JSON configuration as this is covered by the GUI
- troubleshooting

We should break this up into multiple files where we have a main readme, and then we can have a deployment instructions file we link out to, a troubleshooting guide we link out to, etc.  This way we can keep information concise / compartmentalized

Read through our specs and the codebase to get a good understanding of all the functionality we've implemented (like backup/restore) so we can include everything in the readme.

One thing to note is that this readme should be generic to all users.  For example in the diagram we say "Primary CCA" and "Secondary CCA".  This is my setup, however that may not be the names other people use or they may only have one.  The readme should be written in a way that highlights how these types of configurations are supported, but the overall application is configurable.

Let's start by creating a high level table of contents / plan for everything that should be included in the readme.  Then once we agree on the plan / contents, we can use playwright to grab screenshots that we can use and store in the repo.

Work on this in a separate worktree.