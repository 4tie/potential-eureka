import pandas as pd
import pandas_ta as ta
from freqtrade.strategy import IStrategy, IntParameter

class ScalpingStrategy(IStrategy):
    INTERFACE_VERSION = 3

    timeframe = '5m'

    # القيم الافتراضية للـ ROI ووقف الخسارة (سيتم تجاهلها إذا وجد ملف JSON)
    minimal_roi = {
        "0": 0.03,
        "15": 0.015,
        "30": 0.005,
        "60": 0
    }

    stoploss = -0.02

    trailing_stop = True
    trailing_stop_positive = 0.005
    trailing_stop_positive_offset = 0.01
    trailing_only_offset_is_reached = False

    # ----------------------------------------------------
    # تعريف المتغيرات القابلة للتحسين وللقراءة من ملف الـ JSON
    # ----------------------------------------------------
    # مجال البحث لمؤشر RSI عند الشراء (من 20 إلى 40، والافتراضي 30)
    rsi_buy = IntParameter(20, 40, default=30, space='buy', optimize=True)
    
    # مجال البحث لمؤشر RSI عند البيع (من 60 إلى 80، والافتراضي 70)
    rsi_sell = IntParameter(60, 80, default=70, space='sell', optimize=True)

    def populate_indicators(self, dataframe: pd.DataFrame, metadata: dict) -> pd.DataFrame:
        # مؤشر القوة النسبية RSI
        dataframe['rsi'] = ta.rsi(dataframe['close'], length=14)

        # الماك دي MACD
        macd = ta.macd(dataframe['close'])
        dataframe['macd'] = macd['MACD_12_26_9']
        dataframe['macdsignal'] = macd['MACDs_12_26_9']

        # فلتر الترند EMA 200
        dataframe['ema_200'] = ta.ema(dataframe['close'], length=200)

        return dataframe

    def populate_entry_trend(self, dataframe: pd.DataFrame, metadata: dict) -> pd.DataFrame:
        # لاحظ استخدام self.rsi_buy.value لقراءة القيمة من الـ JSON
        dataframe.loc[
            (
                (dataframe['rsi'] < self.rsi_buy.value) &  
                (dataframe['macd'] > dataframe['macdsignal']) &  
                (dataframe['close'] > dataframe['ema_200']) & 
                (dataframe['volume'] > 0)
            ),
            ['enter_long', 'enter_tag']] = (1, 'RSI_MACD_Buy')

        return dataframe

    def populate_exit_trend(self, dataframe: pd.DataFrame, metadata: dict) -> pd.DataFrame:
        # استخدام self.rsi_sell.value لقراءة القيمة من الـ JSON
        dataframe.loc[
            (
                (dataframe['rsi'] > self.rsi_sell.value)
            ),
            ['exit_long', 'exit_tag']] = (1, 'RSI_Sell')

        return dataframe