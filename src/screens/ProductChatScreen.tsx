import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Image, KeyboardAvoidingView, Platform, ScrollView, StyleSheet,
  TextInput, View,
} from 'react-native';
import {
  AppText, Banner, PressableScale, PrimaryButton, Screen, ScreenHeader,
} from '../components';
import type { ScreenProps } from '../navigation/types';
import {
  adoptProductChatMockups, createProductChat, discardProductChatMockups,
  generateProductChatMockups, getProductChat, listProductChats, publishProductChat,
  sendProductChatMessage, type ProductChatSession,
} from '../api/catalogManagement';
import { pickAndUploadImages } from './ProductWizard/pickImages';
import { errorMessage } from '../api/request';
import { colors, radii, spacing } from '../theme/theme';
import { usePermissions } from '../utils/usePermission';

export function ProductChatScreen({ navigation }: ScreenProps<'ProductChat'>) {
  const scroll = useRef<ScrollView>(null);
  const [recent, setRecent] = useState<ProductChatSession[]>([]);
  const [session, setSession] = useState<ProductChatSession | null>(null);
  const [text, setText] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [selectedMockups, setSelectedMockups] = useState<string[]>([]);
  const [mockupOptionsOpen, setMockupOptionsOpen] = useState(false);
  const [busy, setBusy] = useState<'loading' | 'sending' | 'uploading' | 'publishing' |
    'generating' | 'adopting' | 'discarding' | null>('loading');
  const [error, setError] = useState<string | null>(null);
  const { can } = usePermissions();
  const canGenerateMockups = can('ai_catalog.generate');

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const sessions = await listProductChats();
        if (!mounted) return;
        setRecent(sessions);
        if (sessions[0]) setSession(await getProductChat(sessions[0].id));
      } catch (e) {
        if (mounted) setError(errorMessage(e));
      } finally {
        if (mounted) setBusy(null);
      }
    })();
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    const job = session?.mockupJob;
    if (!session || !job || !['queued', 'processing'].includes(job.status)) return;
    const id = session.id;
    let active = true;
    const timer = setInterval(() => {
      getProductChat(id).then(next => {
        if (active) setSession(current => current?.id === id ? next : current);
      }).catch(() => { /* Keep the current job state and retry on the next poll. */ });
    }, 6000);
    return () => { active = false; clearInterval(timer); };
  }, [session]);

  useEffect(() => {
    const job = session?.mockupJob;
    if (job?.status === 'ready') setSelectedMockups(job.outputUrls);
    else setSelectedMockups([]);
    if (job) setMockupOptionsOpen(false);
  }, [session?.mockupJob]);

  const start = async () => {
    if (busy) return;
    setBusy('loading');
    setError(null);
    try {
      const next = await createProductChat();
      setSession(next);
      setRecent(items => [next, ...items]);
      setText('');
      setPhotos([]);
      setMockupOptionsOpen(false);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const open = async (id: string) => {
    if (busy) return;
    setBusy('loading');
    setError(null);
    try { setSession(await getProductChat(id)); setMockupOptionsOpen(false); }
    catch (e) { setError(errorMessage(e)); }
    finally { setBusy(null); }
  };

  const attach = async () => {
    if (busy || photos.length >= 20 || session?.isPublished) return;
    setBusy('uploading');
    setError(null);
    try {
      const uploaded = await pickAndUploadImages(20 - photos.length);
      setPhotos(current => [...current, ...uploaded].slice(0, 20));
    } catch (e) { setError(`Photo upload failed: ${errorMessage(e)}`); }
    finally { setBusy(null); }
  };

  const send = async () => {
    if ((!text.trim() && photos.length === 0) || busy || session?.isPublished) return;
    setBusy('sending');
    setError(null);
    try {
      const active = session ?? await createProductChat();
      if (!session) {
        setSession(active);
        setRecent(items => [active, ...items]);
      }
      const next = await sendProductChatMessage(active.id, { text: text.trim(), imageUrls: photos });
      setSession(next);
      setRecent(items => [next, ...items.filter(item => item.id !== next.id)]);
      if (next.lastTurnSucceeded !== false) {
        setText('');
        setPhotos([]);
      }
    } catch (e) { setError(errorMessage(e)); }
    finally { setBusy(null); }
  };

  const publish = async () => {
    if (!session || busy) return;
    setBusy('publishing');
    setError(null);
    try { setSession(await publishProductChat(session.id)); }
    catch (e) {
      setError(errorMessage(e));
      try { setSession(await getProductChat(session.id)); } catch { /* Keep last known state. */ }
    } finally { setBusy(null); }
  };

  const refresh = async () => {
    if (!session || busy) return;
    await open(session.id);
  };

  const generate = (mode: 'without_model' | 'with_model', modelGender?: 'her' | 'him') => {
    if (!session || busy || session.mockupJob) return;
    setBusy('generating');
    setError(null);
    generateProductChatMockups(session.id, { mode, ...(modelGender && { modelGender }) })
      .then(next => { setSession(next); setMockupOptionsOpen(false); })
      .catch(e => setError(errorMessage(e)))
      .finally(() => setBusy(null));
  };

  const chooseMockupMode = () => {
    if (!session?.listingId || busy || session.isPublished) return;
    if (photos.length || session.readiness?.publishIssues.some(issue => issue.code === 'gallery_required')) {
      setError('Send a product photo in the chat before generating mockups.');
      return;
    }
    setError(null);
    setMockupOptionsOpen(true);
  };

  const adoptMockups = async () => {
    if (!session || busy || !selectedMockups.length) return;
    setBusy('adopting');
    setError(null);
    try { setSession(await adoptProductChatMockups(session.id, selectedMockups)); }
    catch (e) { setError(errorMessage(e)); }
    finally { setBusy(null); }
  };

  const discardMockups = async () => {
    if (!session || busy) return;
    setBusy('discarding');
    setError(null);
    try { setSession(await discardProductChatMockups(session.id)); }
    catch (e) { setError(errorMessage(e)); }
    finally { setBusy(null); }
  };

  const toggleMockup = (url: string) => {
    setSelectedMockups(current => current.includes(url)
      ? current.filter(item => item !== url) : [...current, url]);
  };

  return (
    <Screen edges={['top']}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.header}>
          <ScreenHeader overline="Products · Beta" title="Chatbot" onBack={() => navigation.goBack()} />
          <PressableScale onPress={start} style={styles.newButton}>
            <AppText variant="bodyMedium" color={colors.ink}>New product</AppText>
          </PressableScale>
        </View>

        {recent.length > 1 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.recent}>
            {recent.map(item => (
              <PressableScale key={item.id} onPress={() => open(item.id)} style={[styles.recentItem, item.id === session?.id && styles.recentSelected]}>
                <AppText variant="meta" color={colors.ink} numberOfLines={1}>
                  {item.messages.find(m => m.role === 'user')?.text || 'New product'}
                </AppText>
              </PressableScale>
            ))}
          </ScrollView>
        ) : null}

        {error ? <View style={styles.notice}><Banner tone="danger" title="Couldn't complete that action" message={error} /></View> : null}

        <ScrollView ref={scroll} style={styles.flex} contentContainerStyle={styles.messages}
          onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: true })}>
          {busy === 'loading' ? <ActivityIndicator color={colors.ink} /> : null}
          {!session?.messages.length ? (
            <View style={styles.intro}>
              <AppText variant="cardTitle" color={colors.ink}>Tell me about your product</AppText>
              <AppText variant="body" color={colors.meta}>
                Send all the details at once, or add them a little at a time. Attach photos here. Your progress is saved as a draft; publishing always needs your confirmation.
              </AppText>
            </View>
          ) : null}
          {session?.messages.map((message, index) => (
            <View key={`${message.at}-${index}`} style={[styles.bubble, message.role === 'user' ? styles.mine : styles.bot]}>
              <AppText variant="meta" color={message.role === 'user' ? colors.accentSub : colors.meta}>
                {message.role === 'user' ? 'You' : 'Product assistant'}
              </AppText>
              <AppText variant="body" color={message.role === 'user' ? colors.accentInk : colors.ink}>
                {message.text}
              </AppText>
            </View>
          ))}
          {busy === 'sending' ? <ActivityIndicator color={colors.ink} /> : null}
          {session?.mockupJob ? (
            <View style={styles.checklist}>
              <AppText variant="bodyMedium" color={colors.ink}>Generated mockups</AppText>
              {session.mockupJob.status === 'queued' || session.mockupJob.status === 'processing' ? (
                <View style={styles.jobProgress}>
                  <ActivityIndicator color={colors.ink} />
                  <AppText variant="body" color={colors.meta}>
                    {session.mockupJob.status === 'queued' ? 'Waiting to start. You can keep chatting.' : 'Generating images. You can keep chatting.'}
                  </AppText>
                </View>
              ) : null}
              {session.mockupJob.status === 'failed' ? (
                <Banner tone="danger" title="Mockups could not be generated"
                  message="Your product draft is safe. Discard this attempt and try again." />
              ) : null}
              {session.mockupJob.status === 'ready' ? (
                <>
                  <AppText variant="body" color={colors.meta}>Choose the images you want to add to your product.</AppText>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.mockupRow}>
                    {session.mockupJob.outputUrls.map(url => (
                      <PressableScale key={url} onPress={() => toggleMockup(url)}
                        style={[styles.mockupTile, selectedMockups.includes(url) && styles.mockupSelected]}>
                        <Image source={{ uri: url }} style={styles.mockupImage} resizeMode="cover" />
                        <AppText variant="meta" color={colors.ink}>
                          {selectedMockups.includes(url) ? 'Selected' : 'Tap to select'}
                        </AppText>
                      </PressableScale>
                    ))}
                  </ScrollView>
                  <PrimaryButton label={`Add ${selectedMockups.length} selected photo${selectedMockups.length === 1 ? '' : 's'}`}
                    onPress={adoptMockups} disabled={!selectedMockups.length || !!busy} loading={busy === 'adopting'} />
                </>
              ) : null}
              {session.mockupJob.status !== 'processing' ? (
                <PrimaryButton label={session.mockupJob.status === 'queued' ? 'Cancel generation' : 'Discard mockups'}
                  tone="ghost" onPress={discardMockups} loading={busy === 'discarding'} />
              ) : null}
            </View>
          ) : null}
          {session?.readiness && session.listingId ? (
            <View style={styles.checklist}>
              <AppText variant="bodyMedium" color={colors.ink}>
                {session.readiness.canPublish ? 'Ready for your review' : 'Still needed to go live'}
              </AppText>
              {session.readiness.publishIssues.map(issue => (
                <AppText key={issue.code} variant="body" color={colors.meta}>• {issue.message}</AppText>
              ))}
              <PressableScale onPress={refresh} style={styles.refresh}>
                <AppText variant="meta" color={colors.ink}>Refresh checklist</AppText>
              </PressableScale>
              <PrimaryButton label="Open product" tone="ghost" onPress={() => navigation.navigate('ProductDetail', { id: session.listingId! })} />
              {canGenerateMockups && !session.mockupJob && !session.isPublished ? (
                mockupOptionsOpen ? <View style={styles.mockupOptions}>
                  <AppText variant="bodyMedium" color={colors.ink}>Choose a mockup style</AppText>
                  <AppText variant="body" color={colors.meta}>Uses the first product photo as the reference.</AppText>
                  <PrimaryButton label="Product shots" tone="surface" onPress={() => generate('without_model')}
                    disabled={!!busy} />
                  <PrimaryButton label="On her model" tone="surface" onPress={() => generate('with_model', 'her')}
                    disabled={!!busy} />
                  <PrimaryButton label="On him model" tone="surface" onPress={() => generate('with_model', 'him')}
                    disabled={!!busy} />
                  <PrimaryButton label="Cancel" tone="ghost" onPress={() => setMockupOptionsOpen(false)} />
                </View> : <PrimaryButton label="Generate mockups" tone="surface" onPress={chooseMockupMode}
                  loading={busy === 'generating'} disabled={!!busy} />
              ) : null}
              {session.readiness.canPublish && !session.isPublished ? (
                <PrimaryButton label="Publish product" onPress={publish} loading={busy === 'publishing'} />
              ) : null}
            </View>
          ) : null}
        </ScrollView>

        {session?.isPublished ? (
          <View style={styles.composer}><AppText variant="bodyMedium" color={colors.success}>This product is live. Open it above to edit.</AppText></View>
        ) : <View style={styles.composer}>
          {photos.length ? (
            <View style={styles.photoRow}>
              <AppText variant="meta" color={colors.meta}>{photos.length} photo{photos.length === 1 ? '' : 's'} ready to send</AppText>
              <PressableScale onPress={() => setPhotos([])}><AppText variant="meta" color={colors.ink}>Remove</AppText></PressableScale>
            </View>
          ) : null}
          <View style={styles.composeRow}>
            <PressableScale onPress={attach} style={styles.attach}>
              <AppText variant="bodyMedium" color={colors.ink}>{busy === 'uploading' ? '…' : '+ Photo'}</AppText>
            </PressableScale>
            <TextInput value={text} onChangeText={setText} multiline placeholder="Describe your product…"
              placeholderTextColor={colors.meta} style={styles.input} editable={!busy} />
            <PressableScale onPress={send} style={styles.send}>
              <AppText variant="bodyMedium" color={colors.accentInk}>Send</AppText>
            </PressableScale>
          </View>
        </View>}
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: { paddingHorizontal: spacing.screenH, paddingBottom: spacing.sm },
  newButton: { alignSelf: 'flex-end', paddingVertical: spacing.sm, paddingHorizontal: spacing.md },
  recent: { gap: spacing.sm, paddingHorizontal: spacing.screenH, paddingBottom: spacing.sm },
  recentItem: { maxWidth: 180, padding: spacing.sm, borderRadius: radii.sm, backgroundColor: colors.surface },
  recentSelected: { borderWidth: 1, borderColor: colors.ink },
  notice: { paddingHorizontal: spacing.screenH },
  messages: { paddingHorizontal: spacing.screenH, paddingBottom: spacing.lg, gap: spacing.md },
  intro: { padding: spacing.lg, borderRadius: radii.card, backgroundColor: colors.surface, gap: spacing.sm },
  bubble: { padding: spacing.md, borderRadius: radii.card, gap: spacing.xs, maxWidth: '88%' },
  mine: { alignSelf: 'flex-end', backgroundColor: colors.ink },
  bot: { alignSelf: 'flex-start', backgroundColor: colors.surface },
  checklist: { padding: spacing.md, borderRadius: radii.card, backgroundColor: colors.surface, gap: spacing.sm },
  jobProgress: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  mockupRow: { gap: spacing.sm, paddingVertical: spacing.xs },
  mockupTile: { width: 112, padding: spacing.xs, borderRadius: radii.sm, borderWidth: 2,
    borderColor: colors.hairline, gap: spacing.xs },
  mockupSelected: { borderColor: colors.ink },
  mockupImage: { width: 100, height: 132, borderRadius: radii.sm },
  mockupOptions: { gap: spacing.sm },
  refresh: { alignSelf: 'flex-start', paddingVertical: spacing.sm },
  composer: { padding: spacing.md, gap: spacing.sm, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.hairline },
  composeRow: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm },
  photoRow: { flexDirection: 'row', justifyContent: 'space-between' },
  attach: { padding: spacing.sm },
  input: { flex: 1, maxHeight: 120, minHeight: 42, padding: spacing.sm, color: colors.ink, borderWidth: 1, borderColor: colors.hairline, borderRadius: radii.sm },
  send: { padding: spacing.sm, borderRadius: radii.sm, backgroundColor: colors.ink },
});
