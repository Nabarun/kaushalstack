import React from 'react';
import { Helmet } from 'react-helmet';
import { Link } from 'react-router-dom';
import { Shield, Lock, Mail } from 'lucide-react';

const LAST_UPDATED = 'July 15, 2026';
const CONTACT_EMAIL = 'sengupta.nabarun@gmail.com';

const Section = ({ id, title, children }) => (
  <section id={id} className="scroll-mt-24">
    <h2 className="text-2xl font-bold tracking-tight mb-4">{title}</h2>
    <div className="space-y-4 text-muted-foreground leading-relaxed">{children}</div>
  </section>
);

const SECTIONS = [
  { id: 'introduction', title: '1. Hi, it’s me' },
  { id: 'information-we-collect', title: '2. What I collect' },
  { id: 'how-we-use', title: '3. What I do with it' },
  { id: 'legal-bases', title: '4. Why I’m allowed to have it' },
  { id: 'sharing', title: '5. Who else sees it' },
  { id: 'security', title: '6. How I keep it safe' },
  { id: 'retention', title: '7. How long I keep it' },
  { id: 'your-rights', title: '8. Your rights' },
  { id: 'cookies', title: '9. Cookies' },
  { id: 'international', title: '10. Where your data lives' },
  { id: 'children', title: '11. Kids' },
  { id: 'third-parties', title: '12. Third parties' },
  { id: 'changes', title: '13. If I change this policy' },
  { id: 'contact', title: '14. Talk to me' },
];

const PrivacyPage = () => {
  return (
    <>
      <Helmet>
        <title>Privacy Policy - kaushalstack</title>
        <meta
          name="description"
          content="A plain-English explanation of what I collect on kaushalstack, why, and how I keep it safe. Written by the person who built it."
        />
      </Helmet>

      <div className="min-h-screen">
        <section className="py-16 bg-gradient-to-br from-background via-muted/30 to-background">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-primary/10 rounded-full mb-5">
              <Shield className="w-4 h-4 text-primary" />
              <span className="text-sm font-medium">Privacy, in plain English</span>
            </div>
            <h1
              className="text-4xl md:text-5xl font-bold mb-4 leading-tight"
              style={{ letterSpacing: '-0.02em' }}
            >
              Your data,{' '}
              <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
                looked after
              </span>
            </h1>
            <p className="text-lg text-muted-foreground leading-relaxed max-w-2xl mx-auto">
              I&#39;m Nabarun, the person who builds and runs kaushalstack. This page is my honest
              answer to &quot;what happens to my data if I sign up here?&quot; No legalese
              hidden behind smaller legalese &mdash; just how it actually works.
            </p>
            <p className="mt-4 text-xs text-muted-foreground/70 font-mono">
              Last updated: {LAST_UPDATED}
            </p>
          </div>
        </section>

        <section className="py-12">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-10">
            {/* Table of contents */}
            <aside className="hidden lg:block">
              <div className="sticky top-24">
                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">
                  On this page
                </p>
                <nav className="space-y-1.5 text-sm">
                  {SECTIONS.map((s) => (
                    <a
                      key={s.id}
                      href={`#${s.id}`}
                      className="block text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {s.title}
                    </a>
                  ))}
                </nav>
              </div>
            </aside>

            {/* Body */}
            <div className="space-y-12">
              <Section id="introduction" title="1. Hi, it’s me">
                <p>
                  Kaushalstack is a small, mostly one-person project I run out of India. When you
                  sign up, browse skills, join a round table, or drop me a message, some data ends
                  up on my servers. This policy is me telling you what that data is, why I need
                  it, and what I&#39;ll never do with it.
                </p>
                <p>
                  If any of this feels off, don&#39;t sign up &mdash; and please tell me why, so I
                  can fix it.
                </p>
              </Section>

              <Section id="information-we-collect" title="2. What I collect">
                <p>Roughly, five buckets:</p>
                <ul className="list-disc pl-6 space-y-2">
                  <li>
                    <span className="font-semibold text-foreground">Your account.</span> Name,
                    email, and a password (which I never see &mdash; it&#39;s hashed and salted
                    before it hits the database). You can optionally add a photo, bio, and links.
                  </li>
                  <li>
                    <span className="font-semibold text-foreground">Stuff you create.</span>{' '}
                    Skills you post, blog comments, reviews, round-table transcripts &mdash; the
                    things you deliberately submit.
                  </li>
                  <li>
                    <span className="font-semibold text-foreground">How you use the site.</span>{' '}
                    Which pages you open, what you click, roughly which country you&#39;re in,
                    what browser you&#39;re on. I don&#39;t store your raw IP address.
                  </li>
                  <li>
                    <span className="font-semibold text-foreground">Messages you send me.</span>{' '}
                    Anything you type into the contact form or email to me.
                  </li>
                  <li>
                    <span className="font-semibold text-foreground">A couple of cookies.</span>{' '}
                    One to keep you signed in, one for lightweight, first-party analytics. More on
                    that in Section 9.
                  </li>
                </ul>
                <p>
                  I don&#39;t ask for government IDs, bank details, health records, or biometrics.
                  If a future feature ever needs something like that, I&#39;ll ask you first and
                  update this page.
                </p>
              </Section>

              <Section id="how-we-use" title="3. What I do with it">
                <p>Basically, I use it to make the site work and to make it better:</p>
                <ul className="list-disc pl-6 space-y-2">
                  <li>Sign you in and keep your account secure.</li>
                  <li>Show you the right skills, round tables, and people.</li>
                  <li>Reply to your messages and support requests.</li>
                  <li>Figure out what&#39;s slow, broken, or confusing &mdash; and fix it.</li>
                  <li>Spot and stop spam, abuse, and shady behaviour.</li>
                  <li>Do the boring legal stuff when the law says I have to.</li>
                </ul>
                <p>
                  Two things I want to be loud about:{' '}
                  <span className="font-semibold text-foreground">
                    I don&#39;t sell your data.
                  </span>{' '}
                  And{' '}
                  <span className="font-semibold text-foreground">
                    I don&#39;t feed your content to third-party AI models to train them
                  </span>
                  , unless you&#39;ve explicitly said yes.
                </p>
              </Section>

              <Section id="legal-bases" title="4. Why I’m allowed to have it">
                <p>
                  For the folks who care about GDPR (EU) or the DPDP Act (India), here&#39;s the
                  legal basis for each thing I do:
                </p>
                <ul className="list-disc pl-6 space-y-2">
                  <li>
                    <span className="font-semibold text-foreground">Because you signed up.</span>{' '}
                    I need the basics to give you the account you asked for.
                  </li>
                  <li>
                    <span className="font-semibold text-foreground">Because it&#39;s
                    reasonable.</span> Keeping the site secure and improving it are legitimate
                    interests &mdash; balanced against your rights, obviously.
                  </li>
                  <li>
                    <span className="font-semibold text-foreground">Because you said
                    yes.</span> For anything optional (like marketing emails), I&#39;ll ask
                    first.
                  </li>
                  <li>
                    <span className="font-semibold text-foreground">Because the law says
                    so.</span> Occasionally, I have to keep or share data to comply with legal
                    obligations.
                  </li>
                </ul>
              </Section>

              <Section id="sharing" title="5. Who else sees it">
                <p>Almost nobody. The short list:</p>
                <ul className="list-disc pl-6 space-y-2">
                  <li>
                    <span className="font-semibold text-foreground">The vendors that help me
                    run this.</span> Hosting, email delivery, error tracking &mdash; the kind of
                    plumbing every web app needs. They&#39;re contractually on the hook to keep
                    your data safe.
                  </li>
                  <li>
                    <span className="font-semibold text-foreground">The law.</span> If I get a
                    valid legal order, or someone&#39;s safety is at risk, I&#39;ll share what
                    I&#39;m legally required to.
                  </li>
                  <li>
                    <span className="font-semibold text-foreground">A future acquirer.</span> If
                    kaushalstack ever gets acquired or merges into something bigger, your data may
                    move with it. I&#39;ll email you before that happens.
                  </li>
                  <li>
                    <span className="font-semibold text-foreground">Anyone you tell me
                    to.</span> Otherwise, nobody else.
                  </li>
                </ul>
                <p>
                  I don&#39;t sell your data to advertisers or data brokers. That&#39;s not the
                  business I&#39;m in.
                </p>
              </Section>

              <Section id="security" title="6. How I keep it safe">
                <p>The practical stuff I actually do:</p>
                <ul className="list-disc pl-6 space-y-2">
                  <li>TLS on everything &mdash; the little padlock in your browser is real.</li>
                  <li>Databases and backups are encrypted at rest.</li>
                  <li>Passwords are hashed with modern algorithms (bcrypt / argon2) and a per-user salt. I couldn&#39;t read your password if I tried.</li>
                  <li>Only I (and a very short list of trusted collaborators) can touch production, and only what we need to touch.</li>
                  <li>I patch dependencies regularly and review my own changes for security holes.</li>
                </ul>
                <p>
                  I&#39;m not going to pretend nothing can ever go wrong &mdash; no service in the
                  world can promise that. If something does go wrong and your data is affected,
                  I&#39;ll tell you and the relevant authorities, quickly, and explain what
                  happened.
                </p>
              </Section>

              <Section id="retention" title="7. How long I keep it">
                <p>
                  For as long as your account is live, or as long as I need it to run the site,
                  answer your questions, or comply with the law. When you delete your account:
                </p>
                <ul className="list-disc pl-6 space-y-2">
                  <li>Your profile and personal identifiers disappear within 30 days.</li>
                  <li>
                    Public things you&#39;ve contributed (skills, comments) may stick around in
                    anonymised form so the surrounding conversation still makes sense.
                  </li>
                  <li>Backups age out on their normal rotation &mdash; usually within 90 days.</li>
                </ul>
              </Section>

              <Section id="your-rights" title="8. Your rights">
                <p>
                  Depending on where you live, you have most or all of these. Regardless of where
                  you live, I&#39;ll try to honour them anyway:
                </p>
                <ul className="list-disc pl-6 space-y-2">
                  <li>
                    <span className="font-semibold text-foreground">See it.</span> Ask me for a
                    copy of what I have on you.
                  </li>
                  <li>
                    <span className="font-semibold text-foreground">Fix it.</span> Correct
                    anything wrong from your profile, or email me.
                  </li>
                  <li>
                    <span className="font-semibold text-foreground">Delete it.</span> Ask me to
                    delete your account.
                  </li>
                  <li>
                    <span className="font-semibold text-foreground">Take it with you.</span> Ask
                    for an export in a normal, machine-readable format.
                  </li>
                  <li>
                    <span className="font-semibold text-foreground">Say no.</span> Object to or
                    restrict certain uses of your data.
                  </li>
                  <li>
                    <span className="font-semibold text-foreground">Change your mind.</span>{' '}
                    Withdraw consent for anything you consented to.
                  </li>
                  <li>
                    <span className="font-semibold text-foreground">Complain.</span> Take it to
                    your local data-protection authority if you feel I&#39;ve messed up.
                  </li>
                </ul>
                <p>
                  For any of the above, email me at{' '}
                  <a href={`mailto:${CONTACT_EMAIL}`} className="text-primary hover:underline">
                    {CONTACT_EMAIL}
                  </a>
                  . I aim to reply within a few days, and no later than 30.
                </p>
              </Section>

              <Section id="cookies" title="9. Cookies">
                <p>I only use first-party cookies, and only a couple:</p>
                <ul className="list-disc pl-6 space-y-2">
                  <li>
                    <span className="font-semibold text-foreground">Sign-in.</span> Keeps you
                    logged in so you&#39;re not typing your password every five minutes.
                  </li>
                  <li>
                    <span className="font-semibold text-foreground">Preferences.</span>{' '}
                    Remembers little things like your theme.
                  </li>
                  <li>
                    <span className="font-semibold text-foreground">Analytics.</span>{' '}
                    Anonymised page views and clicks so I can see what&#39;s working. No raw IP
                    addresses stored.
                  </li>
                </ul>
                <p>
                  No third-party ad cookies. You can block cookies in your browser, but if you
                  block the sign-in one, you won&#39;t be able to sign in.
                </p>
              </Section>

              <Section id="international" title="10. Where your data lives">
                <p>
                  The servers are in India. Some of the tools I use (email delivery, error
                  tracking) may process your data in other countries. Where that&#39;s the case,
                  I use standard legal safeguards to make sure your data still gets the same
                  protection.
                </p>
              </Section>

              <Section id="children" title="11. Kids">
                <p>
                  Kaushalstack isn&#39;t built for kids under 13 (or the equivalent age in your
                  country). I don&#39;t knowingly collect data from children. If you&#39;re a
                  parent and you think your kid signed up anyway, email me and I&#39;ll delete
                  the account right away.
                </p>
              </Section>

              <Section id="third-parties" title="12. Third parties">
                <p>
                  The site links out to other places &mdash; YouTube videos, GitHub, partner
                  sites, that sort of thing. Once you&#39;re on someone else&#39;s site, their
                  privacy policy takes over. I can&#39;t vouch for how they handle your data, so
                  it&#39;s worth a quick look before you hand anything sensitive over.
                </p>
              </Section>

              <Section id="changes" title="13. If I change this policy">
                <p>
                  I&#39;ll update this page over time as the product changes. When I do,
                  I&#39;ll bump the &quot;Last updated&quot; date at the top. If it&#39;s a big
                  change that actually affects you, I&#39;ll email you or put a notice on the
                  site before it kicks in &mdash; not after.
                </p>
              </Section>

              <Section id="contact" title="14. Talk to me">
                <p>
                  Any question, concern, or &quot;hey, wait, why do you need this?&quot; &mdash;
                  I&#39;d genuinely rather hear it than not:
                </p>
                <div className="rounded-xl border bg-muted/30 p-5 space-y-2 not-italic text-foreground">
                  <div className="flex items-center gap-2">
                    <Mail className="w-4 h-4 text-primary" />
                    <a href={`mailto:${CONTACT_EMAIL}`} className="text-primary hover:underline">
                      {CONTACT_EMAIL}
                    </a>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Or the{' '}
                    <Link to="/contact" className="text-primary hover:underline">
                      contact form
                    </Link>{' '}
                    &mdash; either way, it lands directly in my inbox.
                  </p>
                </div>
              </Section>

              <div className="pt-6 border-t flex items-center gap-2 text-xs text-muted-foreground">
                <Lock className="w-3.5 h-3.5" />
                <span>
                  Privacy is a product decision, not a checkbox. If anything here reads badly or
                  doesn&#39;t match reality, tell me and I&#39;ll fix it.
                </span>
              </div>
            </div>
          </div>
        </section>
      </div>
    </>
  );
};

export default PrivacyPage;
