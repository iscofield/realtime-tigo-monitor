We are going to be building an application that allows for surfacing near-realtime data on individual solar panel output from my tigo system.

I am reading data in realtime off of the Tigo CCAs and publishing the data to an MQTT topic.  We will retrieve the data and then display the wattage or voltage in real time in a text box with a transparent background that we will place on top of the layout.png.  There will need to be a toggle button at the top that allows the user to specify "Watts" vs "Voltage".

I have 2x tigo CCAs which are the gateways.  Each panel is connected to a single CCA.  There are two solar systems that are tied together for one cohesive system.

The layout.png diagram represents the overview of the system with corresponding string colors.  I have 9 strings total, with letters A-I.

The primary system contains the following strings:
- A
- B
- C
- D
- E
- I

The secondary system contains the following strings:
- F
- G
- H

There are panels that have been physically moved between strings, but the tigo system has not been updated yet to reflect these changes.  The translations.md file indicates these changes.  We will maintain a data model that allows for essentially overwriting the panel label so we can associate it with the right string.  For example, panel "G1" is actually "C9".  In the data returned by the tigo system, it will have the SN which corresponds to panel "G1" but in our application we will always treat it as C9 and associate it accordingly.

There are three files which will help provide this mapping.  the "all" file has a list of what is reported by the tigo system.  It has the CCA and panel information.  For example:
```
String
A
PV Module
A1
TS4-H-O
4-C3F23CR
PV Module
A2
TS4-H-O
4-C3F2ACK
PV Module
...
```

This structure is the start of the block for String A.  It contains PV modules A1, A2, etc.  The string "TS4-H-0" is the type of optimizer that is used and will be the same for all panels.  The SN is the line that starts with "4-....".  So the SN for A1 is 4-C3F23CR.

Then look at the primary.json and the secondary.json where you can see the list of the corresponding SNs.  These three files will help to understand which panel is currently matched to which CCA/Gateway/System.  Remember that in the "all", primary.json, and secondary.json, these all contain the panel names / serial numbers for what the Tigo system sees.  These three files do NOT contain the updated mappings for the panels that have been re-moved.  I will update the tigo system later to reflect these changes.

In order to properly support this, we will need to build an overarching mapping data structure since we have the SN of the panel, which maps to a reported label by the tigo system, which then maps to an updated label.  This data structure will also need to support the associated X, Y coordinates that we will use to add the text box on top of each panel. What would be the recommended data structure to support this?  

This will be a docker deployed app, so we will need to generate a docker compose to be able to run this.  We can test this locally by using docker.

I don't have the MQTT data retrieval yet, so for now we should mock that all with a value of "100" (for watts") or "45" (for voltage).

Items that we will need to research/evaluate.  Use exa to research the following:
- What is the right library / utility to be able to add the text box over the image?  There are 69 panels total, so we will have 69 unique text boxes with X,Y coordinates to place on top of the image
- Should we have the frontend place the text over the image, or should this be fully rendered in the backend?  It might be more efficient to just ship JSON to the frontend with the panel values, and the frontend just updates the values instead of re-rendering the image? But this may have issues in zooming / responsive layout where the text boxes don't stay over the panel locations?

The color shoud be lighter for higher values and darker when the value is lower.  Make a gradient so visually this can show which panels are producing more power vs less.  The panels are up to 420w so 420 is the upper bound for watts.  The panels go up to 50v so that should also be the maximum value.

This will need to be a responsive layout.  This will be viewed on a mobile phone or on a laptop, so we will need to support both views.  Use playwright to evaluate both views to confirm everything is working properly






❯ /cra For the comments regarding the positioning, I will need to provide the coordinates for each.  However, use this image as reference starting point to determine the positions of the boxes.  Also update the  
spec to show the Panel ID (e.g. A1) above the watts or voltage text so you can visually see on the diagram what each panel is.  The pasted image includes the text labels for the respective changes.  for example  
you can see it saying "new string i" where it's pointing to the panels that are labeled F6-F11.


## updates
I want there to be 2x overall tabs.  We'll need to support switching tabs for both desktop and mobile.  For the mobile view, we can have a bar at the bottom that's fixed that allows for the GUI layout view and a text view which shows a table of the information.

On that page, we should have this laid out by system, and then by string.  For each string, we should have a summary table which displays the total watts which is represented by summing up the wattage of the strings.

My installer is currently having issues combining the right panels together to form the strings.  I'd like to have this view also highlight where things are incorrect.  For example, let's say there's string C.  All panels in a string, when using optimizers, should be producing very similar values.  IE C1 is 105w, C2 is 105w, C3 is 104w, etc.  If a panel is +/- 5% or so, it tells me that the panel isn't actually connected to the right string.  As you can't have a panel producing 180w, when the rest of the panels in the string are producing 105w.  We should use client side logic to determine this.

In this scenario, we should put a red rectangle around that string with a notice at the top that says the string is configured incorrectly and indicate which panel is most likely the wrong one based on the incorrect values.