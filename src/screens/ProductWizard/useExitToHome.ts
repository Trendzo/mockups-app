import { useCallback } from 'react';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '../../components';
import { RootStackParamList } from '../../navigation/types';
import { useProductDraft } from '../../store/productDraft';
import { commitProductDraft, validateProductDraft } from '../../api/productCommit';

/** Any user-entered content in a NEW-product draft worth saving on exit. */
function newDraftHasContent(): boolean {
  const d = useProductDraft.getState();
  if (d.mode === 'edit') return false; // editing = don't auto-commit partial edits
  if (d.name.trim() || d.gallery.length || d.brandId || d.categoryId) return true;
  if (d.genders.length || d.basePrice.trim() || d.baseMrp.trim()) return true;
  if (d.description.trim() || d.descriptionLong.trim()) return true;
  if (d.variantMode === 'single') {
    const s = d.single;
    return !!(s.sku.trim() || s.size.trim() || s.imageUrls.length);
  }
  return d.colors.some(
    (c) => c.name || c.colorHex || c.sizes.some((r) => r.size.trim() || r.imageUrls.length),
  );
}

/**
 * The wizard's top-left back button exits straight to the Catalog tab (not
 * step-by-step). A new product that's complete enough to be valid is saved to
 * drafts on the way out so nothing is lost. A partial/invalid draft can't be
 * persisted (the backend needs at least name + brand + category + price), so
 * we tell the user what's missing rather than silently dropping it.
 */
export function useExitWizardToHome() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const qc = useQueryClient();
  const toast = useToast();

  return useCallback(async () => {
    const goHome = () =>
      navigation.reset({
        index: 0,
        routes: [{ name: 'Main', params: { screen: 'Catalog' } }],
      });

    if (newDraftHasContent()) {
      if (validateProductDraft().length === 0) {
        try {
          await commitProductDraft({ publish: false });
          qc.invalidateQueries({ queryKey: ['listings'] });
          qc.invalidateQueries({ queryKey: ['inventory'] });
          toast.show('Saved to drafts', 'success');
          useProductDraft.getState().startCreate();
        } catch (e: any) {
          toast.show(e?.message ?? 'Could not save draft', 'error');
        }
      } else {
        // Not enough to persist a draft - let them know before leaving.
        toast.show('Add name, brand, category & price to save this as a draft', 'info');
      }
    }
    goHome();
  }, [navigation, qc, toast]);
}
