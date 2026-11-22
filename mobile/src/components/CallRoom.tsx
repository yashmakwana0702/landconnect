import {
  AndroidAudioTypePresets,
  AudioSession,
  LiveKitRoom,
  VideoTrack,
  isTrackReference,
  useLocalParticipant,
  useRemoteParticipants,
  useTracks,
  type TrackReferenceOrPlaceholder,
} from '@livekit/react-native';
import { Track, type LocalVideoTrack } from 'livekit-client';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { PermissionsAndroid, Platform, StyleSheet, Text, View, type Permission } from 'react-native';

import { colors } from '@/lib/theme';
import type { LiveKitCredentials } from '@/lib/types';

import { Avatar, RoundButton } from './ui';

interface Props {
  credentials: LiveKitCredentials;
  video: boolean;
  /** Name + status shown over the stage. */
  title: string;
  subtitle: string;
  onHangUp: () => void;
  /** Fired once when the last remote participant leaves after having joined. */
  onRemoteLeft?: () => void;
  /** Extra content shown when nobody else is in the room yet. */
  waiting?: ReactNode;
}

async function ensurePermissions(video: boolean): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  const wanted: Permission[] = [PermissionsAndroid.PERMISSIONS.RECORD_AUDIO];
  if (video) wanted.push(PermissionsAndroid.PERMISSIONS.CAMERA);
  const result = await PermissionsAndroid.requestMultiple(wanted);
  return wanted.every((p) => result[p] === PermissionsAndroid.RESULTS.GRANTED);
}

/** Audio session tuned for calls: speaker for video, earpiece for voice. */
async function startAudio(video: boolean): Promise<void> {
  await AudioSession.configureAudio({
    android: {
      audioTypeOptions: AndroidAudioTypePresets.communication,
      preferredOutputList: video ? ['bluetooth', 'headset', 'speaker'] : ['bluetooth', 'headset', 'earpiece'],
    },
    ios: { defaultOutput: video ? 'speaker' : 'earpiece' },
  });
  await AudioSession.startAudioSession();
}

export function CallRoom(props: Props) {
  const [ready, setReady] = useState(false);
  const [denied, setDenied] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      if (!(await ensurePermissions(props.video))) {
        if (active) setDenied(true);
        return;
      }
      await startAudio(props.video);
      if (active) setReady(true);
    })();
    return () => {
      active = false;
      AudioSession.stopAudioSession();
    };
  }, [props.video]);

  if (denied) {
    return (
      <View style={styles.center}>
        <Text style={styles.title}>Microphone{props.video ? ' / camera' : ''} permission is needed</Text>
        <RoundButton icon="call" color={colors.danger} onPress={props.onHangUp} label="Close" />
      </View>
    );
  }

  return (
    <LiveKitRoom
      serverUrl={props.credentials.url}
      token={props.credentials.token}
      connect={ready}
      audio
      video={props.video}
      options={{ adaptiveStream: { pixelDensity: 'screen' }, dynacast: true }}
    >
      <Stage {...props} />
    </LiveKitRoom>
  );
}

function Stage({ video, title, subtitle, onHangUp, onRemoteLeft, waiting }: Props) {
  const remotes = useRemoteParticipants();
  const tracks = useTracks([Track.Source.Camera], { onlySubscribed: false });
  const { localParticipant, isMicrophoneEnabled, isCameraEnabled } = useLocalParticipant();
  const [speaker, setSpeaker] = useState(video);
  const [facing, setFacing] = useState<'user' | 'environment'>('user');
  const sawRemote = useRef(false);

  useEffect(() => {
    if (remotes.length > 0) sawRemote.current = true;
    else if (sawRemote.current) {
      sawRemote.current = false;
      onRemoteLeft?.();
    }
  }, [remotes.length, onRemoteLeft]);

  const remoteVideo = tracks.filter((t) => !t.participant.isLocal && isTrackReference(t));
  const localVideo = tracks.find((t) => t.participant.isLocal && isTrackReference(t));

  const toggleSpeaker = async () => {
    const next = !speaker;
    const output = Platform.OS === 'ios' ? (next ? 'force_speaker' : 'default') : next ? 'speaker' : 'earpiece';
    await AudioSession.selectAudioOutput(output);
    setSpeaker(next);
  };

  const flipCamera = async () => {
    const next = facing === 'user' ? 'environment' : 'user';
    const track = localParticipant.getTrackPublication(Track.Source.Camera)?.track as LocalVideoTrack | undefined;
    await track?.restartTrack({ facingMode: next });
    setFacing(next);
  };

  const showVideoStage = video && remoteVideo.length > 0;
  return (
    <View style={styles.root}>
      {showVideoStage ? (
        <VideoGrid tracks={remoteVideo} />
      ) : (
        <View style={styles.center}>
          <Avatar name={remotes[0]?.name || title} size={110} />
          {remotes.length === 0 ? waiting : null}
        </View>
      )}

      <View style={styles.header} pointerEvents="none">
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>
        {remotes.length > 1 ? <Text style={styles.subtitle}>{remotes.length + 1} in the room</Text> : null}
      </View>

      {video && localVideo && isTrackReference(localVideo) && isCameraEnabled ? (
        <View style={styles.pip}>
          <VideoTrack trackRef={localVideo} style={StyleSheet.absoluteFill} objectFit="cover" mirror={facing === 'user'} zOrder={1} />
        </View>
      ) : null}

      <View style={styles.controls}>
        <RoundButton
          icon={isMicrophoneEnabled ? 'mic' : 'mic-off'}
          color={isMicrophoneEnabled ? '#2A3942' : colors.danger}
          size={56}
          onPress={() => localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled)}
        />
        {video ? (
          <RoundButton
            icon={isCameraEnabled ? 'videocam' : 'videocam-off'}
            color={isCameraEnabled ? '#2A3942' : colors.danger}
            size={56}
            onPress={() => localParticipant.setCameraEnabled(!isCameraEnabled)}
          />
        ) : null}
        {video ? <RoundButton icon="camera-reverse" color="#2A3942" size={56} onPress={flipCamera} /> : null}
        <RoundButton icon={speaker ? 'volume-high' : 'volume-low'} color={speaker ? colors.primary : '#2A3942'} size={56} onPress={toggleSpeaker} />
        <RoundButton icon="call" color={colors.danger} size={56} onPress={onHangUp} />
      </View>
    </View>
  );
}

function VideoGrid({ tracks }: { tracks: TrackReferenceOrPlaceholder[] }) {
  if (tracks.length === 1 && isTrackReference(tracks[0])) {
    return <VideoTrack trackRef={tracks[0]} style={StyleSheet.absoluteFill} objectFit="cover" />;
  }
  return (
    <View style={styles.grid}>
      {tracks.map((t) =>
        isTrackReference(t) ? (
          <View key={t.participant.identity} style={styles.tile}>
            <VideoTrack trackRef={t} style={StyleSheet.absoluteFill} objectFit="cover" />
            <Text style={styles.tileName}>{t.participant.name}</Text>
          </View>
        ) : null,
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.callBg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 18, backgroundColor: colors.callBg },
  header: { position: 'absolute', top: 60, left: 0, right: 0, alignItems: 'center', gap: 4 },
  title: { color: colors.white, fontSize: 24, fontWeight: '700', textAlign: 'center', textShadowColor: '#0008', textShadowRadius: 6 },
  subtitle: { color: '#D1D7DB', fontSize: 15, textShadowColor: '#0008', textShadowRadius: 6 },
  pip: {
    position: 'absolute',
    right: 16,
    top: 150,
    width: 110,
    height: 160,
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: '#FFFFFF55',
    backgroundColor: '#000',
  },
  controls: {
    position: 'absolute',
    bottom: 40,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 16,
  },
  grid: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', paddingTop: 130, paddingBottom: 130 },
  tile: { width: '50%', height: '50%', borderWidth: 1, borderColor: colors.callBg },
  tileName: { position: 'absolute', bottom: 6, left: 8, color: colors.white, fontWeight: '600', textShadowColor: '#000', textShadowRadius: 4 },
});
