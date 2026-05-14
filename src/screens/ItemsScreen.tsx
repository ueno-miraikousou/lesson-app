import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, Text, View } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PrimaryButton } from '../components/ui/PrimaryButton';
import { TextField } from '../components/ui/TextField';
import {
  createItem,
  deleteItem,
  fetchItemsByLesson,
  reorderItems,
  updateItem,
} from '../lib/items';
import { fetchLessonById } from '../lib/lessons';
import { colors } from '../theme/colors';
import type { Item } from '../types/database';

const MAX_NAME_LENGTH = 30;

/**
 * ITEM-01 持ち物リスト編集 (Sprint 4 C4-T02)。
 *
 * AC1: MEM-06 から「持ち物リスト編集」で遷移
 * AC2: items テーブル CRUD (name, sort_order)
 * AC3: 「追加」ボタン + name 必須 + 30 文字制限
 * AC4: 既存アイテム編集 (タップで編集モード) + 上下ボタンで並び替え (a11y 代替操作)
 * AC5: 楽観的更新 + 失敗時ロールバック
 * AC6: スワイプ削除の代わりに「削除」ボタン + 確認 dialog
 * AC7: CASCADE DELETE は FK 既設定 (schedule_item_checks も連動削除)
 */
export function ItemsScreen() {
  const params = useLocalSearchParams<{ lessonId: string }>();
  const lessonId = params.lessonId ?? '';
  const queryClient = useQueryClient();

  const lessonQuery = useQuery({
    queryKey: ['lesson', lessonId],
    queryFn: () => fetchLessonById(lessonId),
    enabled: !!lessonId,
  });

  const itemsQuery = useQuery({
    queryKey: ['items', lessonId],
    queryFn: () => fetchItemsByLesson(lessonId),
    enabled: !!lessonId,
  });

  const [localItems, setLocalItems] = useState<Item[]>([]);
  const [newItemName, setNewItemName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (itemsQuery.data) setLocalItems(itemsQuery.data);
  }, [itemsQuery.data]);

  const lessonName = lessonQuery.data?.name ?? '';

  async function handleAdd() {
    setError(undefined);
    const trimmed = newItemName.trim();
    if (!trimmed) {
      setError('持ち物の名前を入力してください');
      return;
    }
    if (trimmed.length > MAX_NAME_LENGTH) {
      setError(`持ち物名は ${MAX_NAME_LENGTH} 文字以内で入力してください`);
      return;
    }
    setSubmitting(true);
    const optimistic: Item = {
      id: `optimistic-${Date.now()}`,
      lesson_id: lessonId,
      name: trimmed,
      sort_order: localItems.length,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    const previous = localItems;
    setLocalItems([...localItems, optimistic]);
    setNewItemName('');
    try {
      const created = await createItem({
        lessonId,
        name: trimmed,
        sortOrder: optimistic.sort_order,
      });
      setLocalItems((prev) => prev.map((i) => (i.id === optimistic.id ? created : i)));
      void queryClient.invalidateQueries({ queryKey: ['items', lessonId] });
    } catch {
      setLocalItems(previous);
      setError('追加に失敗しました');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSaveEdit() {
    if (!editingId) return;
    const trimmed = editingName.trim();
    if (!trimmed) {
      setError('持ち物の名前を入力してください');
      return;
    }
    if (trimmed.length > MAX_NAME_LENGTH) {
      setError(`持ち物名は ${MAX_NAME_LENGTH} 文字以内で入力してください`);
      return;
    }
    const previous = localItems;
    setLocalItems(localItems.map((i) => (i.id === editingId ? { ...i, name: trimmed } : i)));
    const idForRequest = editingId;
    setEditingId(null);
    setEditingName('');
    try {
      await updateItem({ id: idForRequest, name: trimmed });
      void queryClient.invalidateQueries({ queryKey: ['items', lessonId] });
    } catch {
      setLocalItems(previous);
      setError('保存に失敗しました');
    }
  }

  function confirmDelete(item: Item) {
    Alert.alert('持ち物を削除', `「${item.name}」を削除しますか？`, [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: '削除',
        style: 'destructive',
        onPress: () => void handleDelete(item.id),
      },
    ]);
  }

  async function handleDelete(id: string) {
    const previous = localItems;
    setLocalItems(localItems.filter((i) => i.id !== id));
    try {
      await deleteItem(id);
      void queryClient.invalidateQueries({ queryKey: ['items', lessonId] });
    } catch {
      setLocalItems(previous);
      setError('削除に失敗しました');
    }
  }

  async function handleMove(id: string, delta: -1 | 1) {
    const idx = localItems.findIndex((i) => i.id === id);
    if (idx < 0) return;
    const newIdx = idx + delta;
    if (newIdx < 0 || newIdx >= localItems.length) return;
    const reordered = [...localItems];
    const [removed] = reordered.splice(idx, 1);
    if (!removed) return;
    reordered.splice(newIdx, 0, removed);
    const previous = localItems;
    setLocalItems(reordered);
    try {
      await reorderItems(reordered.map((i) => i.id));
      void queryClient.invalidateQueries({ queryKey: ['items', lessonId] });
    } catch {
      setLocalItems(previous);
      setError('並び替えに失敗しました');
    }
  }

  return (
    <SafeAreaView
      className="flex-1 bg-background"
      style={{ flex: 1, backgroundColor: colors.background }}
      edges={['top', 'left', 'right']}
    >
      <View
        className="flex-row items-center justify-between border-b border-border bg-surface px-4 py-3"
        testID="items-header"
      >
        <Pressable
          onPress={() => router.back()}
          className="min-h-tap min-w-tap items-center justify-center"
          accessibilityRole="button"
          accessibilityLabel="戻る"
          testID="items-back"
        >
          <Text className="text-body text-primary">＜ 戻る</Text>
        </Pressable>
        <Text className="text-h3 text-text-primary" numberOfLines={1}>
          持ち物リスト
        </Text>
        <View className="min-w-tap" />
      </View>

      <ScrollView className="flex-1 px-4 py-4" testID="items-body" keyboardShouldPersistTaps="handled">
        {lessonName ? (
          <Text className="mb-3 text-caption text-text-secondary">
            {lessonName} の標準持ち物
          </Text>
        ) : null}

        {itemsQuery.isLoading ? (
          <View className="items-center py-6" testID="items-loading">
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : itemsQuery.isError ? (
          <View className="items-center py-6" testID="items-error">
            <Text className="text-body text-error">持ち物を読み込めませんでした</Text>
          </View>
        ) : localItems.length === 0 ? (
          <View className="items-center py-6" testID="items-empty">
            <Text className="text-body text-text-secondary">まだ持ち物が登録されていません</Text>
            <Text className="mt-1 text-caption text-text-secondary">
              例: 水着、ゴーグル、タオル
            </Text>
          </View>
        ) : (
          <View className="gap-2 mb-4" testID="items-list">
            {localItems.map((item, idx) => {
              const isEditing = editingId === item.id;
              return (
                <View
                  key={item.id}
                  className="flex-row items-center rounded-button border border-border bg-surface px-3 py-2"
                  testID={`item-row-${item.id}`}
                >
                  {isEditing ? (
                    <View className="flex-1">
                      <TextField
                        label=""
                        value={editingName}
                        onChangeText={setEditingName}
                        maxLength={MAX_NAME_LENGTH}
                        testID={`item-edit-input-${item.id}`}
                      />
                      <View className="flex-row gap-2">
                        <Pressable
                          onPress={() => void handleSaveEdit()}
                          className="flex-1 rounded-button bg-primary px-3 py-2"
                          accessibilityRole="button"
                          testID={`item-edit-save-${item.id}`}
                        >
                          <Text className="text-center text-body text-white" style={{ color: '#FFFFFF' }}>
                            保存
                          </Text>
                        </Pressable>
                        <Pressable
                          onPress={() => {
                            setEditingId(null);
                            setEditingName('');
                          }}
                          className="flex-1 rounded-button border border-border bg-surface px-3 py-2"
                          accessibilityRole="button"
                          testID={`item-edit-cancel-${item.id}`}
                        >
                          <Text className="text-center text-body text-text-primary">キャンセル</Text>
                        </Pressable>
                      </View>
                    </View>
                  ) : (
                    <>
                      <Pressable
                        onPress={() => {
                          setEditingId(item.id);
                          setEditingName(item.name);
                        }}
                        className="flex-1"
                        accessibilityRole="button"
                        accessibilityLabel={`${item.name} ${idx + 1}番目、タップで編集`}
                        testID={`item-tap-edit-${item.id}`}
                      >
                        <Text className="text-body text-text-primary">{item.name}</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => void handleMove(item.id, -1)}
                        disabled={idx === 0}
                        className="min-h-tap min-w-tap items-center justify-center px-2"
                        accessibilityRole="button"
                        accessibilityLabel={`${item.name} を上に移動`}
                        accessibilityState={{ disabled: idx === 0 }}
                        testID={`item-move-up-${item.id}`}
                      >
                        <Text
                          className="text-h3"
                          style={{ color: idx === 0 ? colors.border : colors.primary }}
                        >
                          ↑
                        </Text>
                      </Pressable>
                      <Pressable
                        onPress={() => void handleMove(item.id, 1)}
                        disabled={idx === localItems.length - 1}
                        className="min-h-tap min-w-tap items-center justify-center px-2"
                        accessibilityRole="button"
                        accessibilityLabel={`${item.name} を下に移動`}
                        accessibilityState={{ disabled: idx === localItems.length - 1 }}
                        testID={`item-move-down-${item.id}`}
                      >
                        <Text
                          className="text-h3"
                          style={{
                            color: idx === localItems.length - 1 ? colors.border : colors.primary,
                          }}
                        >
                          ↓
                        </Text>
                      </Pressable>
                      <Pressable
                        onPress={() => confirmDelete(item)}
                        className="min-h-tap min-w-tap items-center justify-center px-2"
                        accessibilityRole="button"
                        accessibilityLabel={`${item.name} を削除`}
                        testID={`item-delete-${item.id}`}
                      >
                        <Text className="text-body text-error">削除</Text>
                      </Pressable>
                    </>
                  )}
                </View>
              );
            })}
          </View>
        )}

        <View className="mb-2 border-t border-border pt-4">
          <Text className="mb-2 text-caption text-text-primary">新しい持ち物を追加</Text>
          <TextField
            label=""
            value={newItemName}
            onChangeText={setNewItemName}
            placeholder="例: 水着、タオル"
            maxLength={MAX_NAME_LENGTH}
            testID="items-add-input"
          />
          <PrimaryButton
            label={submitting ? '追加中…' : '追加'}
            onPress={() => void handleAdd()}
            disabled={submitting || !newItemName.trim()}
            testID="items-add-button"
          />
        </View>

        {error ? (
          <Text
            className="mt-2 text-caption text-error"
            accessibilityLiveRegion="polite"
            testID="items-error-message"
          >
            {error}
          </Text>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}
