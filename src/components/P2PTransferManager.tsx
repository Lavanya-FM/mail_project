import { useEffect } from 'react';

/**
 * P2PTransferManager
 * Headless component that listens for P2P events and can be used for global side effects.
 * Most state management is now moved to the useP2PTransfers hook for UI flexibility.
 */
export default function P2PTransferManager() {
    useEffect(() => {
        // We can keep global event listeners here if any "background" processing 
        // (like auto-archiving transfers) is needed that doesn't depend on UI being mounted.

        // For now, this component is kept for architectural consistency 
        // but its UI has been moved to the sidebar-integrated TransfersView.
    }, []);

    return null;
}
