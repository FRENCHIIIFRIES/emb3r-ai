A small terminal-dwelling AI companion that runs a language model entirely on your own machine. By default, nothing you type is sent to a server — and as of v1.1.0 you can verify that, and enforce it.

## v1.30.1 — a light loading screen for a light theme

If you use light mode, every launch began with a full-screen black rectangle that turned white the moment the app finished loading. The loading screen had one background colour and it was black, and everything drawn on it — the wordmark, the torches, the little spirit that runs along them — was coloured for sitting on black.

It follows the theme now. The colours are not simply the dark ones lightened: an unlit torch has to stay faint against whatever is behind it, so it stays faint, while the wordmark goes the other way and turns dark, because letters waiting to catch fire should look like cold metal rather than something already burnt out.

The flash was a second problem hiding behind the first. The theme was being applied by the same file that draws the rest of the window, and that file runs last, so the loading screen had already appeared before anything knew which theme to use. It is now decided before the first frame is drawn.

## v1.30.0 — the fire tells you what it is doing

The header had quietly become the main event. On a normal laptop window it took well over half the screen while the conversation got about an eighth of it. The face was large and on its own line, with mood and status stacked underneath.

The face and the mood share one line now, and the status text is not drawn at all. The chat has roughly three times the room it had.

The status did not disappear so much as change medium. The fire on the salamander's back has a pace for each thing the machine is doing: slow when idle, quicker while it is reading a file, quicker still while it is thinking, and a hard flare when something is genuinely going out to the web. The offline lock banks it down to embers.

That last one is the reason for the whole change. A flare at the edge of your vision is a better way to know a connection opened than a small label you stopped reading weeks ago. Nothing new was drawn for it; each state only changes the tempo of the breathing that arrived in v1.28.0. The written status is still there for screen readers, because a burning coil says nothing to one.

Accent colours can now be typed as a hex code, next to the wheel, since a wheel cannot land on an exact value. Anything that is not six hex digits is refused. Anything that would be unreadable against your theme is adjusted, and it says so rather than quietly handing you something else — a near-black accent on the dark theme is lifted until it can be read, and it tells you it lifted it.

Ember also knows who made it. Ask who built it and it will say Ziyan Dobaria, rather than naming whoever trained the model underneath or inventing a company.

## v1.29.1 — the switch, beside its label

The checkbox under Settings > Memory was at one end of the panel and the words explaining it were at the other, with a hand's width of nothing in between. Text boxes in Settings are meant to run the full width; a checkbox is not, and this one had been left out of the rule that says so.

It was found by photographing the tab for the project's evidence document, not by reading the code. Nothing about the markup looks wrong, which is how it got through a review and a release.

## v1.29.0 — it remembers, if you let it

Ember can be told things worth keeping between conversations. What you are working on, how you like your answers, the name of your dog. Settings > Memory. They live on this machine in the same file as the rest of your settings, they belong to whichever profile you are using, and a switch turns the whole thing off without deleting any of them.

The interesting part is what a memory is allowed to cost. The first version put every remembered fact into every single reply, which sounds harmless until you count it: twenty of them is about a quarter of everything the model can hold, spent before you have typed a word. On a laptop with no room to spare that is the difference between an answer and a truncated one.

So they work the way attached files already do here. Only the ones your question actually touches get sent, and they are dropped again afterwards. Ask about your dog and it brings up the dog. Ask about anything else and the dog costs nothing. In practice that is around one percent of the window instead of a quarter.

Getting the matching right needed one correction. Asking *what is my dog called* also pulled up "an Electron app called emb3r" — the two share the word "called". A list of words to ignore would never have caught that, because "called" is an ordinary word right up until you have written it twice. Ember now works out for itself which words are too common across your own memories to tell them apart.

Also new: **Qwen3.5 4B**, the newest model on the list and the quickest of the capable ones, at 2.6GB. Checked before it was offered — that it exists, that it is the size claimed, and that the engine inside emb3r actually knows how to load it. A model that fails when you first ask it something is worse than one that was never listed.

## v1.28.0 — the salamander breathes

The mark in the header stood still. It breathes now: each of the four flames on the creature's back lifts from its own base and settles, and the hottest part of the fire flickers on a faster clock inside that slower breath. The four run on lengths that do not divide into each other, so they drift apart instead of pulsing in unison. The body does not move — the coil is a ring, and a ring that breathes reads as a wobble.

It moves in whole pixels rather than gliding. Smoothing the motion was tried and thrown away: it did glide, but it also made the creature look soft, and softness is the one thing a pixel-art animal cannot afford.

Underneath, the drawing is no longer 418 separate squares. Each shade is now a single shape, which is what made animating it possible at all — squares laid edge to edge crack apart along their shared edges the moment they stop being snapped to whole pixels. 418 pieces became 17.

If your system is set to reduce motion, none of this runs.

## v1.27.3 — the coil comes inside

The coiled salamander was drawn for the taskbar and stayed there; the header kept the long side-on drawing. It is the mark in the application now too, square beside the six-line wordmark rather than running most of its width.

The colouring changed with it. The old header mark took the accent in its flames only and kept a neutral grey body, on the reasoning that a fully tinted creature stops reading as an animal at some hues. That is still true of a grey body with coloured fire — but a salamander that is *made* of fire has no such problem, so here the whole creature burns in whatever colour you picked: body in dark shades of it, flames bright, five steps from the one value.

The outline is the exception and stays near-black at every hue. It is what holds the silhouette together, and an outline that shifts with the fill stops being an outline.

The icon keeps its fixed ember. It sits on a desktop nobody controls, so it cannot borrow a colour that only exists inside the app.

## v1.27.2 — the salamander is alight

The coiled icon had a neutral grey body, which meant the creature read as a dark ring with three flames balanced on top of it rather than as something burning. Its body is coal now — deep in the shadow, lit along the spine, brightest where the flames meet it — and the fire runs further round the coil.

The new flames were not drawn by hand. A first attempt grew them outward from the ring a cell at a time and produced thin diagonal dashes: joined to the body, and nothing like fire. The flames already in the drawing are five cells wide and taper, so one of them is lifted out of the artwork and stamped where the fire was missing. The shape then matches because it is the same shape, not because it was judged to be close enough.

Where it goes is measured too. The template needs seven rows above the ring, and only part of the upper arc has them; a flame with its tip sliced off by the edge of the icon reads as damage, so anywhere it would not fit whole is refused rather than trimmed.

The outline stays near-black. Warming that as well would have cost the silhouette at sixteen pixels, which is the size this drawing exists for.

## v1.27.1 — an icon that fills its square

The salamander is drawn side-on, which makes it nearly twice as wide as it is tall. Dropped into a square icon that is a hard ceiling: at full width it still only reaches half the height, so next to something like Chrome's circle it looks half the size. Rotating it diagonally buys 5% and ruins the pixel grid. Cropping to the head makes it legible and unidentifiable. There is no arrangement of a 2:1 drawing that fills a square.

So the icon uses a different drawing: the same salamander coiled round on itself, flames along its back, which is square by construction. It spans 85% by 90% of the canvas instead of 100% by 51%, and at sixteen pixels the ink covers 14x14 rather than 16x7.

The mark inside the app and on the site is unchanged. A wide drawing is right beside a wordmark and wrong in a launcher; a round one is the reverse. They are the same creature either way.

Both are drawn from their own pixel grids with no smoothing, which also fixes the blurring that made the old icon mush at small sizes.

## v1.27.0 — a redrawn salamander that takes your colour

The mark was a 15x12 pixel sketch. It is a 35x18 drawing now: the same creature, with a shaded body, three flames rising off its spine and embers running down the tail. The application icon is the same artwork.

It also follows the accent colour. Pick a colour and the flames move with it, in three shades derived from the one you chose, while the body stays neutral so the salamander is still a salamander at any hue. That is done in the stylesheet rather than in code — the mark is inline vector with a class on each block, and the shading comes from color-mix, so there is no second copy of the artwork and nothing to keep in step.

The artwork arrived as a picture, which cannot change colour. Recovering it as vector took two attempts: sampling the original file put the drop shadow and the image grain inside the blocks and produced a body full of holes. Sampling the cleaned-up sprite instead gave a clean 35x18 grid, which became 107 rectangles.

## v1.26.0 — a second question about the same file

Attaching a document and asking one question worked. Asking a second gave back a greeting — “Hi Ziyan, it looks like you're really interested in Frankenstein” — sometimes with the bare word “assistant” in front of it, and no answer to what was actually asked.

The extracts pulled out of the file were being glued onto the front of the message, which meant they were stored in the conversation like any other thing you had typed. Measured with the model's own tokeniser, six extracts from a large PDF come to 1,907 tokens. The smallest models here have a 4,096-token window. After two questions the conversation held 3,909 of those 4,096, leaving 187 tokens for the reply — so the model began answering, ran out of room, and the window shifted underneath it, cutting the chat template in half. The stray “assistant” was that template showing through.

The extracts now travel beside the message rather than inside it. The model sees them for the question that needed them, and they are dropped from the conversation as soon as the reply is finished. Two questions now leave 95 tokens in the conversation instead of 3,909.

The size limit was wrong in the same direction: it could ask for 20KB of a file, about 5,120 tokens, which is more than the entire window it had to fit inside. It is derived from the context now, with the constant acting as a ceiling rather than a floor.

The instruction to the model was also sharpened, because a small model handed a pile of extracts tends to describe them rather than answer. It is now told, explicitly, to answer the question that was asked and not to summarise what the file is about unless that is the question.

## v1.25.2 — the app's own advice had gone stale

The Gemini model box carried a suggestion: if the default does not work for your account, try “gemini-2.5-flash”. Google has since stopped offering that model to new accounts, so anyone who took the suggestion got “this model is no longer available to new users” and a broken web search. The advice was sound when it was written and quietly stopped being sound, which is the failure mode of naming a specific version in help text at all.

The box now says what it should have said in the first place: leave it empty. Empty means “gemini-flash-latest”, an alias Google repoints at whatever its current Flash model is, so it keeps working as models come and go. Naming a specific version pins you to that one, and specific versions are exactly what gets withdrawn.

Checked against a real key rather than the documentation, which still lists the retired model as available: the default works, “gemini-3.6-flash” works, “gemini-flash-lite-latest” works, and “gemini-2.5-flash” is refused for new accounts.

## v1.25.1 — a key in the wrong box

The Test key button added in v1.25.0 did its job on its first outing, and what it found was not the key. Web access was failing with “unexpected model name format” because an API key had been pasted into the **Gemini model** box as well as the key box, so emb3r was dutifully asking Google for a model named after a credential.

Two things were wrong, and only one of them was the typing.

The model field took anything at all. It now refuses a value that starts like a credential, and refuses anything that is not shaped like a model name, saying which of the two it is. It also stops claiming to have saved a value it rejected — the interface reported success regardless of the answer, so a refused value looked accepted and the next reply failed for no visible reason.

The more serious half: unlike the API key, the model name is not treated as a secret. It is shown in a plain text box and it is handed to the interface layer with the rest of the settings. A key sitting there was a secret in a place built for something public. Any config still holding one has it cleared on launch, with a line in the log saying so, which also un-breaks web access rather than leaving it failing until someone found the right box.

## v1.25.0 — telling you why the key was rejected

If you pasted a Gemini API key that did not work, emb3r said nothing. The first sign was a reply that quietly came from the local model, and the notice attached to that only covered 401, 403 and 429 responses. A rejected key returns a 400, which fell through to a flat “Gemini couldn’t answer” that never mentioned the key at all.

There is a **Test key** button now, next to Save. It makes one real request through the same client and model an actual reply would use, so if it passes, the real path works — and if it fails, it reports what Google said rather than a guess. The 400 case is handled properly too, and now names the key as the thing to look at.

Saving a key that is plainly a different kind of credential — an OpenAI key, an OAuth token, a URL, anything with a space in it — now says so. It never refuses to save; it just tells you.

One correction worth recording. That check was first written to reject keys beginning “AQ.”, on the assumption that Gemini keys start with “AIza”. That was wrong. Google is part-way through a migration: “AQ.” authorization keys are what AI Studio issues by default now, “AIza” standard keys stop being accepted in September 2026, and both work with the endpoint emb3r calls. The warning would have told people to go and get a key format that can no longer be created. Both are accepted in silence, and there is a test asserting it, because warning about a key that works is worse than not warning at all.

## v1.24.0 — it can read your documents now

Attaching a PDF used to get you "isn't a text file". Ember reads them now, along with Word documents, Excel spreadsheets, PowerPoint decks, RTF, EPUB and the OpenDocument equivalents. Nothing changes about how you attach one — the paperclip is back where it was, and the file goes in the same way.

Spreadsheets come through as rows with their columns kept in line, one block per sheet, with the sheet names intact. Slides arrive one block per slide. PDFs keep their page boundaries. That structure is there because it is what makes a document answerable: asking "what was the revenue for the North region" only works if the row survived the trip.

A PDF that is nothing but a scan now says so. Previously the honest outcome and the useless one looked identical — an empty read is indistinguishable from a read that found nothing, and Ember would have answered from nothing at all rather than telling you it could not see the page. It needs character recognition, which emb3r does not have, and saying that plainly is better than a confident answer about a blank.

All the parsing happens in the main process, not the window. A malformed document should fail somewhere it can be contained, and the zip-based formats — .docx, .xlsx, .pptx and the rest are all zip files underneath — are read with limits on how far they are allowed to expand, so a small hostile file cannot become a very large one in memory.

## v1.23.0 — bring your own model

Until now emb3r ran one of six models it shipped knowing about. It will now run whatever GGUF you point it at.

Paste a Hugging Face link under Settings > Models — the repository page, a file link, or just `owner/repo` — and emb3r reads what is actually in that repository and lists every GGUF version it holds, each with its real size and a rough note on the memory it wants. A repository like `bartowski/Llama-3.2-3B-Instruct-GGUF` carries eighteen of them, from a 1.5GB IQ3_M to a 6.5GB Q8_0, and which one is right depends entirely on the machine. That was the whole reason for listing them rather than guessing: picking the quantisation is the choice, so the choice is shown.

Direct links to a `.gguf` release asset on GitHub work too.

If you already have a model on disk — downloaded before, copied from another machine, sitting on an external drive — "Use a file I already have" points emb3r at it where it is. It is not copied and it is not moved. Removing it from the list only forgets it; your file is never deleted. Only models emb3r downloaded itself get deleted when you remove them, and the button says which will happen before you press it.

Some care went into the parts that could hurt. Downloads are only accepted from huggingface.co and github.com — a link to anywhere else is refused before a single request is made. Any filename arriving from a URL or a repository listing is reduced to a bare name, so nothing can steer where the file lands. And what arrives is checked for the GGUF header before it is added to your list, which means a 404 page or a truncated file is deleted and reported rather than discovered later as a crash inside the engine.

Split models — the ones published as `-00001-of-00003` shards — are listed but not offered, because emb3r loads a single file and cannot join them. Saying so in the list seemed better than letting someone download a third of a model and find out afterwards.

## v1.22.0 — a student mode, for the people who asked for one

emb3r can now be handed to a school student without much worry about what comes back. Turn on student mode and Ember is told, before every reply, that it is talking to a student: nothing sexual, nothing graphic, no profanity, and nothing about weapons, drugs or self-harm. If a student brings up hurting themselves, Ember says plainly to talk to a teacher or another trusted adult rather than trying to counsel them itself.

A short list of blunt, explicitly harmful questions never reaches the model at all — they get a fixed, safe reply instead, and if web access is on, they don't leave the machine either. That list is deliberately narrow. A filter that blocks "how did people die in the Blitz" is worse than no filter, so the patterns cover only the cases where a wrong answer could actually hurt someone, and the rest is left to the prompt.

Being straight about what this is: it steers a language model, it does not police one. A determined student can still phrase their way around it, and it is no substitute for supervision or for a school's own network filtering. It reduces accidental exposure. That is the claim, and the settings page says so in those words rather than implying a guarantee.

Because most people installing emb3r are not a school, the whole thing stays out of the way: there is no "Student mode" entry in the sidebar until you search settings for it — try "student", "school" or "safe" — and it reappears permanently once the mode is on, so whoever turned it on can find their way back. An optional PIN stops it being switched off again, and while it is on, the Personality page is read-only, since that box is otherwise the obvious way to undo the whole thing.

Also fixed: searching settings and then clicking a different section no longer snaps you back to the search result.

## v1.21.1 — the Settings button loses its marker

Small follow-up to v1.21.0. Settings kept an asterisk where its gear icon used to be, while History had been left as plain text — so the two buttons sitting next to each other didn't match. Both are plain now.

## v1.21.0 — something to read while it loads

The loading screen used to hold one line for the whole of a phase, which on a slow start meant the same sentence sitting there for twenty seconds. It now cycles: ember-themed phrases for whatever the fire is doing, facts about how emb3r was built, and — rarely — an easter egg worth finding.

The facts are all true and all checkable. Searching a 20MB file really does take 44 milliseconds. The icon artwork really did fill only 79% of its canvas before it was fixed. Your own messages really were, briefly, almost invisible against the background.

The little spirit that travels the torches now flickers instead of sitting still, and the last emoji have left the interface — History is plain text, and the gear and paperclip are ASCII, which suits a program built out of ASCII everywhere else.

## v1.20.0 — an introduction, a searchable Settings, and a clearer Models page

A fresh install now explains itself. Three short slides cover what emb3r is, the fact that nothing leaves your machine, and what Ember should call you — and the name you give goes straight onto your profile rather than creating a second one. It's optional; leave it blank and Ember simply won't use a name.

After an update you'll get a summary of what changed, listing every release between the version you last opened and the one you're on, so skipping a version doesn't mean missing its notes. It's built into the app, not fetched, so it works with the network off like everything else here. A brand-new install never sees it — there's nothing yet to have missed.

Settings is a sidebar instead of a row of tabs, and it's searchable. The search knows what things are actually called: type "glow", "mute" or "colour" and it finds Display; "key" finds Web access; "ram" finds Hardware.

The Models page is easier to read. Buttons line up down the right, the model in use is marked, and a model your machine can't hold now says what it needs instead of offering a Download button that was only going to refuse. There's also a running total of how much disk your models are using.

Two smaller fixes: the download bar no longer appears to strike through the description above it, model details follow your accent colour instead of a fixed blue, and starting a new chat no longer leaves you looking at a blank panel.

## v1.19.0 — delete models you don't want, and a tidier window

You can now delete a model from Settings → Models. Six models at 1.9–9GB each add up quickly, and until now the only way to get one back off your disk was to go hunting for the folder yourself.

The model you're currently using can't be deleted — switch to another one first. That's deliberate: pulling the model out from under a running session would leave emb3r unable to answer anything. Deleting takes two clicks rather than a dialog box, and it clears up any half-finished download left behind from an earlier attempt, which was otherwise invisible and still taking up space.

The File / Edit / View / Window menu bar is gone on Windows and Linux. It came from Electron by default and had nothing to do with emb3r — there's no file to open and no view to change. On macOS a minimal menu stays, because that's where ⌘C, ⌘V and ⌘Q actually live and removing it would quietly break them.

## v1.18.0 — Ember has more to say with its face

Seven new expressions, each tied to something actually happening rather than added for variety. Ember winks when a copy works, looks surprised at a file too big to read in one go, and scans left and right while answering from a document you've attached. It looks delighted rather than merely happy when its mood is full, and wears a distinct face when a model fails to load — which is a different problem from a reply going badly, and worth being able to tell apart at a glance. Turn the offline lock on and Ember settles into a calm, deliberately shut expression.

Two new effects: a puff of smoke when you stop a reply mid-sentence, and a brief flicker when something goes wrong. Both respect the Reactions toggle in Settings → Display and your system's reduce-motion setting, exactly like the sparkle and heart already did.

## v1.17.0 — the loading screen says what it's doing

The wait while a model loads now explains itself. There are two lines under the torches: one says what the fire is doing — *striking the flint*, *feeding the fire*, *banking the coals* — and the quieter line beneath names the actual step, with a real percentage where there is one to give. Where there genuinely isn't one, during the hardware probe, it doesn't invent a number.

Heat now spreads through the EMB3R wordmark in step with the torches, so the letters and the row read as one thing rather than two. And the spirit that travels the row finally has somewhere to arrive: a brazier at the end that catches only when the model has genuinely finished loading.

A fresh install with nothing downloaded yet has no model to wait for, so instead of skipping the sequence in silence it now says so.

## v1.16.0 — a bigger icon, and the salamander comes inside

The app icon was sitting small in the taskbar — the artwork only filled about 79% of the width and 53% of the height of its own canvas, so a good chunk of what you saw was empty space. It's now cropped in to fill the frame properly, about 13% larger with no loss of detail.

The salamander also joins the ASCII EMB3R banner inside the app, sitting just to its left. The wordmark itself is untouched. The salamander picks up whatever accent colour and theme you've chosen, so it stays legible in light and dark alike rather than being a fixed colour pasted on top.

Windows users: if the taskbar or Start Menu still shows the old icon after updating, that's Windows' own icon cache rather than a bad update — it clears on its own, or immediately after a sign-out and back in.

## v1.15.0 — new app icon

emb3r has a new icon: a pixel-art salamander with three flames rising from its spine, replacing the previous ASCII-grid design. It's used for the taskbar, the app window, and the installer on both Windows and macOS.

The in-app wordmark (the ASCII banner on the boot screen and in the pet display) is unchanged — this is an icon-only update.

Note for Windows users: after installing, if the taskbar or Start Menu still briefly shows the old icon, that's Windows' own icon cache, not a bad update — it clears on its own, or immediately after a sign-out/sign-in.

## v1.14.0 — the boot screen actually waits for the model now

Previously, the loading screen faded out on a fixed timer whether or not the model had actually finished loading — on a slower machine or a bigger model, you could land in the chat before there was anything behind it to answer.

It now waits for the real thing, dressed up to match: a small ember spirit travels across a row of torches, lighting each one as the model genuinely loads, with the last torch reserved for true completion rather than "close enough." While the app is warming up its hardware detection (a stretch with no progress signal to report at all), the spirit fidgets around so the screen never looks frozen.

A fresh install with nothing downloaded yet skips all of this and goes straight to the usual first-run setup — there's nothing to wait for.

## v1.13.0 — attachment limit adjusted, internal cleanup

The per-file attachment limit introduced in v1.11.0 is now **5MB**, down from 20MB. Files above that are still refused with a clear message rather than silently cut short — that part hasn't changed, just the number. Anything up to 5MB that doesn't fit in the model's context window is still handled the same way: split into sections and searched per question, rather than pasted in whole.

No user-facing feature changes beyond that. The rest of this release is internal housekeeping — some dead code and a couple of silently-overridden CSS properties that never actually did anything, cleaned up while looking for exactly that.

## v1.12.0 — Ember reacts

A few small touches to make Ember feel more like it's actually there:

- **A sparkle** drifts up off each reply as it lands
- **A heart** appears when Ember is genuinely glad to help — not on every reply, only when you're appreciative or the answer is a warm one, so it stays meaningful
- **A gentle bob** while Ember is thinking, on top of the face animation that was already there
- **A soft fade** when you switch between conversations, instead of the transcript changing in a single jump

All of it is decoration — nothing here changes what Ember says. If you'd rather not have it, there's a **Reactions** toggle in Settings → Display right next to Sound effects, and it also respects your system's reduce-motion setting automatically.

## v1.11.0 — attach a whole textbook

Attachments now accept files up to **20MB each**, up from about 20KB.

That needed more than a bigger number. A 20MB file is roughly 5 million tokens, and the models here have a context window of a few thousand — so a whole document is around 1,300× too large to hand to the model, and no model in the list changes that. Quietly cutting it short would mean Ember answering confidently from page one of a textbook.

So emb3r stops trying to read it all at once. It splits the file into sections and **searches it for each question you ask**, using only the parts that match. Searching a 20MB file takes about 40 milliseconds, happens entirely on your machine, and needs no extra download.

It also tells you what it did rather than letting you assume: you'll see how many sections it searched and which ones it used, and if nothing in the file matches your question it says so instead of guessing. Files small enough to read in full are still read in full — the searching only kicks in when it has to.

Your attachment also **stays available for follow-up questions** now, instead of being used up by the first message. There's a bar above the input showing what's attached, with an ✕ to remove it, and it clears itself when you switch to another conversation.

## v1.1.0 — you can now check the "offline" claim, not just take it

**emb3r was quietly contacting Google on every launch.** Its typeface was being fetched from `fonts.googleapis.com` each time the app opened, which sent your IP address and the time you opened it. The font files bundled in the app that were supposed to prevent this turned out not to be fonts at all — they were 136-byte text files with the wrong extension, so they had never worked. Both typefaces are now genuinely bundled, so the app looks the same online and off, and that connection is gone.

While fixing it we audited everything else the app sends out and found two more things the docs never mentioned: Spotify was being polled every 10 seconds while connected, and Gemini web access (opt-in, but undisclosed here).

So now:

- **A network light in the top-left.** Dim when nothing is happening, amber only while something is genuinely leaving your machine — and it says what, in plain words: "downloading a model", "checking for updates".
- **An offline lock** in Settings → Privacy. Turn it on and emb3r refuses every outbound connection. It's enforced where the connections are actually made, so it applies even to code inside the app's dependencies — not just greyed-out buttons.
- **A log of every connection since launch**, so you can check for yourself rather than trusting a claim.

The lock covers this app, not your whole computer, and the interface says so plainly rather than implying more.

**It picks a model that suits your machine.** emb3r now reads your GPU and its memory, not just your RAM, and recommends the largest model that will actually run *well* — not the smallest that fits. A machine with a decent graphics card gets offered something worth its hardware; a laptop without one is still kept out of trouble, because a model that technically fits but answers at a crawl is worse than a smaller one that doesn't.

The model list is legible now too: each one says what it's good at, where it gives up, and how it'll perform *on your machine specifically* — plus a download-time estimate measured from your actual connection.

**It has its own icon.** The app, taskbar, shortcut and installer no longer show Electron's default diamond.

## New since v1.0.9

- The **Gemini model is now overridable** in Settings → Web access, instead of a single hardcoded default — useful if your account doesn't have access to "gemini-flash-latest" but does work with a specific model like "gemini-2.5-flash"

## New since v1.0.8

- **It's now obvious when a message is going to the web.** Automatic web-access detection only asks permission once, ever — after that it silently routes matching messages to Gemini. Now you get an unmissable notice the moment it happens, not just a subtle label after the fact, and past conversations show which replies used the web too

## New since v1.0.7

- Gemini web access now **falls back to the local model instead of dead-ending** when it fails (rate limit, bad key, etc.), with a plain-English explanation instead of a raw API error

## New since v1.0.6

- File attachments **now always accept ordinary ~20KB files**, regardless of which model is loaded — the previous fix still fell short of that on the smallest context size

## New since v1.0.5

- Fixed **your own chat messages being nearly invisible in light theme** — they were a fixed color unrelated to the theme or your chosen accent color; now they track your accent (at a distinct shade from Ember's replies) and stay legible in both themes
- File attachments can now use **more of the model's context window** (up to 70%, up from 50%)

## New since v1.0.4

- **Settings is now a full page with tabs** (Account, Personality, Spotify, Web access, Models, Hardware, Updates, Display) instead of a small overlay panel you had to scroll through
- The clipboard icon on each message is **always visible** now, instead of only appearing on hover
- Fixed **Gemini web access returning an error for everyone** — it was pointed at a model Google has since retired
- Custom accent colors are now kept **readable against the background** — picking a very dark color in dark mode (or very light in light mode) could previously make the whole app illegible

## New since v1.0.2

- **Replies stream in** as they're generated, with a stop button and a live tokens/sec + context readout
- **Conversation history** — each profile now keeps its own chats, saved to disk and restored on launch
- **Copy buttons** on every message and for the whole conversation
- **Editable personality** — the instructions that define Ember are no longer hardcoded; change them in Settings
- **Checks for updates from inside the app** (see below)
- File attachments are validated — rejects anything that isn't actually text, and anything too large for the model's context window

## Which file do I want?

| Your machine | Download |
|---|---|
| Mac with Apple Silicon (M1–M4) | `emb3r-*-arm64.dmg` |
| Mac with an Intel chip | `emb3r-*-x64.dmg` |
| Windows | `emb3r-*-x64.exe` |

Not sure which Mac you have? Apple menu → About This Mac. If it says "Apple M…" you want arm64.

## First launch — please read

These builds are **not code-signed**, so your operating system will warn you the first time. This is expected and does not mean anything is wrong.

**macOS.** You will see "Apple could not verify emb3r is free of malware."

1. Open **System Settings → Privacy & Security**
2. Scroll down to the message about emb3r
3. Click **Open Anyway**

On macOS 15 (Sequoia) and later, right-click → Open no longer works. You have to use System Settings.

**Windows.** SmartScreen will show a blue "Windows protected your PC" dialog. Click **More info**, then **Run anyway**.

## Then what?

emb3r ships without a language model, because they are large and the right one depends on your hardware. On first launch it reads your CPU, RAM and free disk, recommends a model that will actually run on your machine, and offers to download it.

Models range from about 1.9 GB to 9 GB. The download happens once; after that everything runs offline. You need at least **4 GB of RAM** for the smallest model.

## Checking for updates

emb3r checks for new versions on launch and lets you download them from **Settings → Updates** — no need to keep coming back to this page.

On Windows, downloaded updates install the next time you restart the app.

On macOS, this may not always be able to install automatically — these builds aren't signed with a paid Apple Developer certificate, which macOS requires for an update to apply itself. If that happens, emb3r will tell you and offer a direct link to download the new version here instead, same as installing it the first time.

## Known limitations

- Unsigned, hence the warnings above
