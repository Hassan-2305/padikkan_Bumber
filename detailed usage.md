<img width="1280" height="640" alt="git (1)" src="https://github.com/user-attachments/assets/8920b256-2ba8-4988-b824-5351134eb4bd" />



# Padikkan Bumper 🎯


## Basic Details
### Team Name: Irrelevant


### Team Members
- Team Lead: Mohammed Hassan - School Of Engineering, CUSAT
- Member 2: Midhun Raaj - School Of Engineering, CUSAT

### Project Description
Essentially it is an anti-productivity tool. You want to be productive and *actually* do some real work? Well, you can, by EARNING IT THROUGH DOOMSCROLLING

### The Problem (that doesn't exist)
People are able to use the internet and the its vast repertoire of tools and services to be incredibly productive and get some actual work done. 
This leads them to not being able to engage in doomscrolling and indulge in their need for instant gratification

### The Solution (that nobody asked for)
An anti-productivity tool in which you *are* able to do work...while also indulging in your thirst for instant gratification🗣️🔥
First of all, to do any work you need to first earn coins. You can do that by doomscrolling on Instagram reels.
And once you have seen enough reels you would have accumulated enough coins where you can now engage in a bit of gambling 🎲🔥
With the coins you've amassed you can buy lottery tickets which provide you with varying amounts of time to study. If you win the lot, you can study for a set time as given in the lottery ticket, and if you lose you've got to try again with another ticket. And if you run out of money, you have to doomscroll once again until you amass enough coins to do work, otherwise you aren't gonna work💯🔥
You can also go into debt to Blade Chettan and go all in as well🗣️🔥

## Technical Details
### Technologies/Components Used
For Software:
- **Languages:** JavaScript (Vanilla ES6+)
- **Frameworks:** Chrome Extension API (Manifest V3)
- **Libraries:** WebAudio API, Canvas API, Chrome Storage API
- **Tools:** Node.js (for testing), no build tools or dependencies


### Implementation
For Software:
# Installation
```bash
1. Open chrome://extensions
2. Enable "Developer mode" (top right)
3. Click "Load unpacked" and select the padikkan-bumper folder
4. Extension will appear in toolbar
5. (Optional) For PDF files: Click Details → Enable "Allow access to file URLs"
```

# Run
```bash
# Launch the extension by clicking the toolbar icon
# Or navigate to a blocked site to trigger the overlay

# Run tests
node test/all.js
```


# Project Documentation
For Software:

# Screenshots (Add at least 3)
![Screenshot1](Add screenshot 1 here with proper name)
*Add caption explaining what this shows*

![Screenshot2](Add screenshot 2 here with proper name)
*Add caption explaining what this shows*

![Screenshot3](Add screenshot 3 here with proper name)
*Add caption explaining what this shows*

# Diagrams
# Technical Architecture
The extension uses Manifest V3 with:
- `src/background/service-worker.js` — Single source of truth for all state
- `src/shared/config.js` — Economy settings, odds, site lists, Malayalam copy
- `src/shared/fx.js` — Confetti canvas, WebAudio sounds, bundled dialogue clips
- `src/content/blocker.js` — Freezes pages, mounts overlay
- `src/content/earner.js` — Coin mining HUD for Instagram/YouTube
- `src/popup/` — Dashboard interface
- `src/pages/` — PDF block screen, welcome page
- `test/` — 256+ test assertions
  
### Project Demo
# Video
[Add your demo video link here]
*Explain what the video demonstrates*


## Team Contributions
- Mohammed Hassan: [Specific contributions]
- Midhun Raaj: [Specific contributions]

---
Made with ❤️ at TinkerHub Useless Projects 

![Static Badge](https://img.shields.io/badge/TinkerHub-24?color=%23000000&link=https%3A%2F%2Fwww.tinkerhub.org%2F)
![Static Badge](https://img.shields.io/badge/UselessProjects--26-26?link=https%3A%2F%2Ftinkerhub.org%2Fevents%2F1M8ORET9A1%2Fuseless-projects-3.0)


