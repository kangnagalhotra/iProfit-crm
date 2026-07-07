import { CustomerSuccessKanban } from '../components/CustomerSuccessKanban';

export function CustomerSuccessBoard() {
  return (
    <div>
      <h2 style={{ marginTop: 0 }}>Customer Success</h2>
      <p style={{ color: 'var(--muted)', marginTop: -6 }}>
        Track customers through onboarding, active engagement, and renewal — drag a card to update its stage.
      </p>
      <CustomerSuccessKanban />
    </div>
  );
}
