## updates
create readme with screenshots
    include screenshots of the missing/excess panels detected and the validation logic




Two things regarding the layout editor:
- The layout editor seems to be cropping the top of my layout image off?  Is it constraining the aspect ratio instead of just displaying the image?
- on the layout editor page, you have to click "edit layout" after going on the layout editor page.  This is redundant.  It should just drop straight into editor mode, hence the name of the tab









Using our spec workflow, I want to implement a backup/restore functionality that will safely allow for a user to move their installation, or if they need to safely upgrade and want to have a way to bring forward their settings.

Things I'd like to include are:
- backgound/layout image
- string definitions and the corresponding mappings
- all the panel translations for where panels are moved across strings
- the coordinates for the panel overlays
- I believe the layout funtionality supports scaling both the background and panel overlays, so those configurations should remain
- MQTT broker configuration

We can have a settings section which allows a user to access the backup/restore functionality.

The backup should export a single zip file that has a date / timestamp in the file name so it can be easily versioned.  We also should store a version ID in case we ever change the schema / add additional fields so we can have an import strategy that identifies if there is information that is missing that will need additional user configuration on user import or at the very least safe defaults.

When restoring, we should drop the user back to the initial setup wizard but with all the information pre-filled in.  This will allow us to reuse all the validation / confirmation steps in case the user wants to make any changes.  

The general setup wizard, which is our first time setup wizard, should now have a new first step which allows for a user to pick from a clean / fresh setup, or if they want to restore from a backup.  If they restore, all the information is pre-populated in the wizard, they just can confirm / approve the information as they click through.

