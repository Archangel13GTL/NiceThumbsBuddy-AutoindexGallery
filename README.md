<div align="center">

![Soulful Thumbs banner]({{file:file-JkmiJ86Ne92nWh2tDQ3JTi}})

# Soulful Thumbs — Autoindex Gallery

**Turn chaotic directory listings into a stunning, stress‑free gallery.**

Soulful Thumbs doesn’t just prettify your server’s bare "Index of…" pages—it helps you _find everything_.  Inspired by sales legends like **Zig Ziglar** and **Dale Carnegie**, this project focuses on helping people.  Ziglar taught that great sellers inspire hope and earn trust[1]; Carnegie urged us to understand what people truly need before we try to influence them[2].  This userscript applies those lessons by giving you clarity and control over your files—no hidden agendas, no hype.

</div>

## 🚀 Why Soulful Thumbs?

Modern servers still spit out plain directory indexes.  That’s fine for a robot—but humans need context.  Soulful Thumbs transforms Apache/Nginx listings into an intuitive gallery that **never hides a file**.  It’s as comfortable on a photographer’s archive as it is on a developer’s asset folder.

* **Find it all**: The built‑in **interactive sitemap** crawls all reachable directories on your domain and builds a collapsible tree.  Filter by extension, include or skip files, set depth/page limits, and even export the structure as JSON.  A **reveal hidden links** toggle un‑hides sneaky anchors styled off‑screen.
* **Grid ↔ list views**: Switch between a sleek thumbnail grid or a list with sortable **Name**, **Type**, **Resolution (MP)**, **Size** and **Date** columns.  Natural sort means “IMG_2” comes before “IMG_10”[3].
* **Best‑in‑class search & sort**: Filter by name, sort by type, size, resolution, date or random—metadata is fetched on‑demand in the viewport and cached.
* **Zoom in style**: A buttery lightbox supports fit, fill, 100 %, ± zoom, drag‑to‑pan and keyboard shortcuts.  Pinch‑zoom works on touch devices too.
* **Readable & customisable**: Adjust tile size, gap, and label font on the fly.  Big, high‑contrast folder labels improve legibility—perfect for scanning through hundreds of folders.
* **Privacy‑friendly**: Runs entirely client‑side; no analytics or network calls beyond fetching the pages you ask for.  Your data never leaves your browser.
* **Drop‑in install**: Works with Tampermonkey, Violentmonkey and Greasemonkey.  No external dependencies and no special permissions.

## 👨‍💻 Real‑world uses

* **Family photo archive** — turn “Index of /2023/Christmas/” into a beautiful photo wall; zoom into details and export a JSON index for backup.
* **Design asset library** — quickly find that forgotten SVG; sort by resolution to pick the sharpest icon; use the sitemap to audit all subfolders.
* **Research datasets** — verify that every file in a dataset is accounted for.  Grid view for images, list view for CSVs or PDFs; export the structure for reproducibility.
* **Home server dashboards** — mount your NAS directories through the browser with easy navigation and advanced search.  Perfect for Pi‑hosted backups.

## 🛠️ Installation

1. Install a userscript manager such as **Tampermonkey**, **Violentmonkey** or **Greasemonkey**.
2. [Download and install the script](./soulful-thumbs.user.js) or create a new userscript in your manager and paste the contents of `soulful-thumbs.user.js`.
3. Navigate to any Apache, FancyIndex or Nginx directory listing, or a folder served on a CMS (`/uploads/`, `/pictures/`, `/files/`).  Soulful Thumbs will automatically detect the index and activate.

## 📝 Changelog (v2.0.0)

**2.0.0 — Interactive sitemap & list view (2025‑08‑19)**

* Added **interactive sitemap panel**: crawl same‑origin listings, filter by extension, include/exclude files, set depth and page limits; export tree as JSON.
* Added **Find‑in‑tree** filter for the sitemap to quickly locate folders/files.
* Added **Grid ↔ list view** toggle; list view shows Type, Resolution (MP), Size, Date; supports all sort options.
* Improved **natural sorting** and added new sorts (Type, Resolution, Size, Date, Random).
* Enlarged folder labels and added adjustable label font size for better readability.
* Added **reveal hidden links (page)** toggle to show hidden anchors on tricky indexes.
* Improved lightbox with zoom/pan, pinch‑zoom and keyboard controls; added focus trap and `aria-modal` for accessibility.
* All settings persist via localStorage; metadata requests are throttled and cached.

## 🎉 Credits & philosophy

Created by **Archangel** — a collaboration between you and me.  In the spirit of Zig Ziglar’s advice to _inspire your customers_ and _earn their trust_[1], this script doesn’t “sell” anything; it simply makes your life easier.  And, as Dale Carnegie urged, it tries to understand what users need and help them get it[2].  Hope it brings clarity and joy to your digital life!

## 📚 References

[1] Zig Ziglar, *Secrets of Closing the Sale*. New York: Doubleday, 1984.

[2] Dale Carnegie, *How to Win Friends and Influence People*. New York: Simon & Schuster, 1936.

[3] Wikipedia contributors, "Natural sort order," *Wikipedia, The Free Encyclopedia*, https://en.wikipedia.org/wiki/Natural_sort_order (accessed August 23, 2025).
