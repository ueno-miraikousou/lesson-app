import GorhomBottomSheet, {
  BottomSheetBackdrop,
  BottomSheetView,
  type BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet';
import { forwardRef, useCallback, useImperativeHandle, useMemo, useRef } from 'react';
import type { ReactNode } from 'react';

import { colors } from '../../theme/colors';

export interface BottomSheetHandle {
  open: () => void;
  close: () => void;
}

export interface BottomSheetProps {
  children: ReactNode;
  /** 各 snap point の高さ (例: ['50%', '90%']) */
  snapPoints?: ReadonlyArray<string | number>;
  /** バックドロップタップで閉じる */
  closeOnBackdropTap?: boolean;
  /** ハンドルバー表示 */
  showHandle?: boolean;
  /** 閉じた時に呼ばれる */
  onClose?: () => void;
}

/**
 * フォーム / フィルタ等に使う汎用ボトムシート。
 *
 * 利用イメージ:
 *   const ref = useRef<BottomSheetHandle>(null);
 *   <BottomSheet ref={ref}>...</BottomSheet>
 *   ref.current?.open();
 *
 * 参照: 02_設計/画面/共通フォームコンポーネント仕様.md §4
 *      02_設計/デザインシステム.md §6.3
 */
export const BottomSheet = forwardRef<BottomSheetHandle, BottomSheetProps>(function BottomSheet(
  {
    children,
    snapPoints = ['50%', '90%'],
    closeOnBackdropTap = true,
    showHandle = true,
    onClose,
  },
  ref,
) {
  const sheetRef = useRef<GorhomBottomSheet>(null);
  const memoizedSnapPoints = useMemo(() => snapPoints, [snapPoints]);

  useImperativeHandle(ref, () => ({
    open: () => sheetRef.current?.expand(),
    close: () => sheetRef.current?.close(),
  }));

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop
        {...props}
        appearsOnIndex={0}
        disappearsOnIndex={-1}
        opacity={0.4}
        pressBehavior={closeOnBackdropTap ? 'close' : 'none'}
      />
    ),
    [closeOnBackdropTap],
  );

  function handleChange(index: number) {
    if (index === -1 && onClose) {
      onClose();
    }
  }

  return (
    <GorhomBottomSheet
      ref={sheetRef}
      index={-1}
      snapPoints={memoizedSnapPoints as (string | number)[]}
      enablePanDownToClose
      handleIndicatorStyle={
        showHandle ? { backgroundColor: colors.border } : { display: 'none' }
      }
      backgroundStyle={{ backgroundColor: colors.surface }}
      backdropComponent={renderBackdrop}
      onChange={handleChange}
    >
      <BottomSheetView style={{ flex: 1, padding: 16 }}>{children}</BottomSheetView>
    </GorhomBottomSheet>
  );
});
