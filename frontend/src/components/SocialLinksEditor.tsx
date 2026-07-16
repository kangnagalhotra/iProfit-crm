import { Icon } from './Icon';

export interface OtherSocialLink { platform: string; url: string; }

const URL_RE = /^https?:\/\/.+/i;

export function validateSocialUrl(url: string): boolean {
  return !url || URL_RE.test(url.trim());
}

// Three named platforms (LinkedIn/Instagram/Twitter) plus a repeatable
// "other platform" list — used on both Lead and Contact forms.
export function SocialLinksEditor({
  linkedinUrl, instagramUrl, twitterUrl, otherLinks,
  onChangeLinkedin, onChangeInstagram, onChangeTwitter, onChangeOtherLinks,
}: {
  linkedinUrl: string;
  instagramUrl: string;
  twitterUrl: string;
  otherLinks: OtherSocialLink[];
  onChangeLinkedin: (v: string) => void;
  onChangeInstagram: (v: string) => void;
  onChangeTwitter: (v: string) => void;
  onChangeOtherLinks: (v: OtherSocialLink[]) => void;
}) {
  function updateOther(i: number, patch: Partial<OtherSocialLink>) {
    onChangeOtherLinks(otherLinks.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }
  function removeOther(i: number) {
    onChangeOtherLinks(otherLinks.filter((_, idx) => idx !== i));
  }
  function addOther() {
    onChangeOtherLinks([...otherLinks, { platform: '', url: '' }]);
  }

  return (
    <div className="form-grid-2">
      <div className="field"><label>LinkedIn</label>
        <input value={linkedinUrl} onChange={(e) => onChangeLinkedin(e.target.value)} placeholder="https://linkedin.com/in/…" /></div>
      <div className="field"><label>Instagram</label>
        <input value={instagramUrl} onChange={(e) => onChangeInstagram(e.target.value)} placeholder="https://instagram.com/…" /></div>
      <div className="field"><label>Twitter / X</label>
        <input value={twitterUrl} onChange={(e) => onChangeTwitter(e.target.value)} placeholder="https://x.com/…" /></div>
      <div className="field field-span-2">
        <label>Other socials</label>
        {otherLinks.map((link, i) => (
          <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
            <input
              style={{ flex: '0 0 140px' }}
              placeholder="Platform"
              value={link.platform}
              onChange={(e) => updateOther(i, { platform: e.target.value })}
            />
            <input
              style={{ flex: 1 }}
              placeholder="https://…"
              value={link.url}
              onChange={(e) => updateOther(i, { url: e.target.value })}
            />
            <button type="button" className="row-remove-btn" onClick={() => removeOther(i)} aria-label="Remove">
              <Icon name="trash" size={14} />
            </button>
          </div>
        ))}
        <button type="button" className="link-btn" onClick={addOther}>+ Add another platform</button>
      </div>
    </div>
  );
}
