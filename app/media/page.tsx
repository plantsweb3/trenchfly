import Image from "next/image";
import type { Metadata } from "next";
import CopyMediaText from "@/components/CopyMediaText";
import { SITE_URL, SOCIAL_URL, SOCIAL_HANDLE } from "@/lib/site";
import s from "./media.module.css";

const description = "RobinFly is an open-source experiment that presents market charts to a simulated fruit-fly connectome and publishes its neural proposals and onchain outcomes on Robinhood Chain.";
const title = "RobinFly — Media kit";
export const metadata: Metadata = {
  title,
  description: "RobinFly artwork, logos, banners, launch copy and a short mascot film. Official media resources from @RobinFlyPons.",
  alternates: { canonical: `${SITE_URL}/media` },
  openGraph: { title, description, url: `${SITE_URL}/media`, type: "website", images: [{ url: "/media/art/robinfly-small-brain-public-record-landscape-live.png", width: 1672, height: 941, alt: "RobinFly campaign art: Small brain. Public record." }] },
  twitter: { card: "summary_large_image", title, description, creator: SOCIAL_HANDLE, images: ["/media/art/robinfly-small-brain-public-record-landscape-live.png"] },
};

const downloads = [
  ["X header", "1500 × 500 · PNG", "social/x-header.png"],
  ["Profile image", "800 × 800 · PNG", "identity/avatar.png"],
  ["Launch card", "1600 × 900 · PNG", "social/launch-landscape.png"],
  ["Portrait poster", "1080 × 1350 · PNG", "social/launch-portrait.png"],
  ["Square post", "1080 × 1080 · PNG", "social/character-square.png"],
  ["Vertical story", "1080 × 1920 · PNG", "social/story.png"],
  ["How it works", "1600 × 900 · PNG", "social/how-it-works.png"],
  ["Live receipt card", "Recorded CASHCAT cycle · PNG", "social/live-receipts.png"],
  ["Receipt links", "Explorer references and context", "evidence/LIVE-RECORD.md"],
  ["Receipt sources", "Two successful transactions · JSON", "evidence/live-cycle-receipts.json"],
  ["Historical paper observation", "Archived, timestamped evidence · PNG", "social/recorded-observation.png"],
  ["Wordmark", "Editable · SVG", "identity/wordmark.svg"],
  ["Fly symbol", "Editable · SVG", "identity/fly-symbol.svg"],
  ["Launch posts", "Ready-to-copy text · Markdown", "copy/X-POSTS.md"],
  ["Brand guide", "Colors, voice and asset usage", "BRAND-GUIDE.md"],
];

export default function MediaPage() {
  return <div className={s.page}>
    <a href="#media-main" className={s.skip}>Skip to media kit</a>
    <header className={s.header}>
      <a href="/" className={s.wordmark}>ROBINFLY<span>.</span></a>
      <nav aria-label="Media navigation"><a href="/#session">Watch the session</a><a href={SOCIAL_URL} target="_blank" rel="noopener noreferrer">{SOCIAL_HANDLE} ↗</a></nav>
    </header>
    <main id="media-main">
      <section className={s.intro} aria-labelledby="media-title">
        <p className={s.kicker}>ROBINFLY / MEDIA RESOURCES</p>
        <div className={s.titleRow}><h1 id="media-title">Small brain.<br /><span>Big presence.</span></h1><div><p>Artwork, identity and the words to introduce the experiment.</p><a href="/media/robinfly-launch-kit.zip" download className={s.primary}>Download the launch kit <span aria-hidden="true">↓</span></a><p className={s.archiveNote}>PNG + SVG · campaign art · MP4 · launch copy</p></div></div>
      </section>
      <figure className={s.campaign}>
        <Image src="/media/art/robinfly-small-brain-public-record-landscape-live.png" width={1672} height={941} alt="RobinFly at a miniature trading desk under lime and blue light. Small brain. Public record. Live experiment." sizes="(max-width: 800px) 100vw, 1280px" priority />
        <figcaption><span>Campaign illustration / Small brain. Public record.</span><a href="/media/art/robinfly-small-brain-public-record-landscape-live.png" download>Download original ↓</a></figcaption>
      </figure>
      <section className={s.about} aria-labelledby="about-title">
        <div><p className={s.kicker}>THE SHORT VERSION</p><h2 id="about-title">A strange idea.<br />An open record.</h2></div>
        <div className={s.boilerplate}><p>{description}</p><CopyMediaText text={description} /><p className={s.note}>Live execution is backed by recorded transaction receipts. The worker publishes its current mode and timestamp with each feed update. Chart understanding and profitable learning have not been demonstrated. RobinFly is independent and is not affiliated with Robinhood.</p></div>
      </section>
      <section className={s.editorial} aria-label="Campaign and motion assets">
        <figure><Image src="/media/art/robinfly-let-the-fly-cook-square-live.png" width={1254} height={1254} alt="Faceted RobinFly rubbing his forelegs. Let the fly cook. Watch the experiment. Live session." sizes="(max-width: 800px) 100vw, 620px" /><figcaption><span>Character campaign / Let the fly cook.</span><a href="/media/art/robinfly-let-the-fly-cook-square-live.png" download>PNG ↓</a></figcaption></figure>
        <div className={s.motion}><div><p className={s.kicker}>THE DESK IS HIS NOW.</p><h2>A little pre-market<br />grooming.</h2></div><video controls playsInline preload="none" poster="/media/motion/robinfly-desk-loop-poster.png" aria-label="Six-second silent mascot film showing RobinFly grooming at his desk"><source src="/media/motion/robinfly-desk-loop.mp4" type="video/mp4" />Your browser cannot play this clip. Use the download link below.</video><p>Original Blender rig. Decorative mascot motion; no trade execution is depicted.</p><a href="/media/motion/robinfly-desk-loop.mp4" download>Download the silent film · MP4 ↓</a></div>
      </section>
      <section className={s.assets} aria-labelledby="assets-title">
        <div className={s.sectionHead}><h2 id="assets-title">Ready to share.</h2><p>Choose a file, or take the complete kit.</p></div>
        <div className={s.identityPreview}><Image src="/media/social/x-header.png" width={1500} height={500} alt="RobinFly X header with official @RobinFlyPons handle" sizes="(max-width: 800px) 100vw, 1000px" /><Image src="/media/identity/avatar.png" width={800} height={800} alt="RobinFly lime fly symbol with coral eyes" sizes="200px" /></div>
        <ul className={s.downloads}>{downloads.map(([name,detail,file])=><li key={file}><a href={`/media/${file}`} download><span><strong>{name}</strong><small>{detail}</small></span><span aria-hidden="true">↓</span></a></li>)}</ul>
      </section>
      <section className={s.use} aria-labelledby="use-title"><div><p className={s.kicker}>KEEP THE SIGNAL CLEAR</p><h2 id="use-title">Use the art.<br />Keep the context.</h2></div><div><p>Use these assets to cover or share RobinFly. Keep the name, proportions and mode labels intact, and link to robinfly.net or {SOCIAL_HANDLE}.</p><p>Campaign artwork is illustrative. The recorded observation card has its own timestamp and source data; it is a historical paper record. The live receipt card documents a separate onchain cycle, with its own source links and receipt data. Editable decision templates must be filled with verified information before sharing.</p><a href="/media/BRAND-GUIDE.md" download>Read the brand guide ↓</a></div></section>
    </main>
    <footer className={s.footer}><a href="/" className={s.wordmark}>ROBINFLY<span>.</span></a><div><a href="/#session">Watch the experiment</a><a href={SOCIAL_URL} target="_blank" rel="noopener noreferrer">Follow on X ↗</a><a href="https://github.com/plantsweb3/trenchfly" target="_blank" rel="noopener noreferrer">Source code ↗</a></div></footer>
  </div>;
}
