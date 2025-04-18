FasdUAS 1.101.10   ��   ��    k             l      ��  ��   ��
Script to wait until the iPhone Simulator is responding to AppleScript,
and then tell it to activate (come to the foreground).

We don't just want to activate it without first waiting to see if it is
running, because another script has already launched it, so if we
just did an activate now, we could end up with two instances of
the iPhone Simulator.

Xcode 6 Usage: osascript iphone_sim_activate.scpt "iOS Simulator" "Disabled"
Xcode 6 Usage: osascript iphone_sim_activate.scpt "iOS Simulator" "Apple Watch - 38mm"
Xcode 6 Usage: osascript iphone_sim_activate.scpt "iOS Simulator" "Apple Watch - 42mm"
Xcode 7 Usage: osascript iphone_sim_activate.scpt "Simulator"
     � 	 	6 
 S c r i p t   t o   w a i t   u n t i l   t h e   i P h o n e   S i m u l a t o r   i s   r e s p o n d i n g   t o   A p p l e S c r i p t , 
 a n d   t h e n   t e l l   i t   t o   a c t i v a t e   ( c o m e   t o   t h e   f o r e g r o u n d ) . 
 
 W e   d o n ' t   j u s t   w a n t   t o   a c t i v a t e   i t   w i t h o u t   f i r s t   w a i t i n g   t o   s e e   i f   i t   i s 
 r u n n i n g ,   b e c a u s e   a n o t h e r   s c r i p t   h a s   a l r e a d y   l a u n c h e d   i t ,   s o   i f   w e 
 j u s t   d i d   a n   a c t i v a t e   n o w ,   w e   c o u l d   e n d   u p   w i t h   t w o   i n s t a n c e s   o f 
 t h e   i P h o n e   S i m u l a t o r . 
 
 X c o d e   6   U s a g e :   o s a s c r i p t   i p h o n e _ s i m _ a c t i v a t e . s c p t   " i O S   S i m u l a t o r "   " D i s a b l e d " 
 X c o d e   6   U s a g e :   o s a s c r i p t   i p h o n e _ s i m _ a c t i v a t e . s c p t   " i O S   S i m u l a t o r "   " A p p l e   W a t c h   -   3 8 m m " 
 X c o d e   6   U s a g e :   o s a s c r i p t   i p h o n e _ s i m _ a c t i v a t e . s c p t   " i O S   S i m u l a t o r "   " A p p l e   W a t c h   -   4 2 m m " 
 X c o d e   7   U s a g e :   o s a s c r i p t   i p h o n e _ s i m _ a c t i v a t e . s c p t   " S i m u l a t o r " 
   
  
 l     ��������  ��  ��        i         I     �� ��
�� .aevtoappnull  �   � ****  o      ���� 0 argv  ��    k     �       q         ������ 0 	simulator  ��        q         ������ 0 ext_display  ��        q         ������ 
0 legacy  ��     ��  Z     �  ����  ?        l      ����   I    �� !��
�� .corecnte****       **** ! o     ���� 0 argv  ��  ��  ��    m    ����    k   
 � " "  # $ # r   
  % & % n   
  ' ( ' 4    �� )
�� 
cobj ) m    ����  ( o   
 ���� 0 argv   & o      ���� 0 	simulator   $  * + * l   ��������  ��  ��   +  ,�� , Z    � - .���� - =    / 0 / n     1 2 1 1    ��
�� 
prun 2 4    �� 3
�� 
capp 3 o    ���� 0 	simulator   0 m    ��
�� boovtrue . O    � 4 5 4 k   # � 6 6  7 8 7 l  # #�� 9 :��   9 !  focus the simulator window    : � ; ; 6   f o c u s   t h e   s i m u l a t o r   w i n d o w 8  < = < I  # (������
�� .miscactvnull��� ��� null��  ��   =  > ? > l  ) )��������  ��  ��   ?  @ A @ l  ) )�� B C��   B J D if they specified a 2nd arg, then this must be the external display    C � D D �   i f   t h e y   s p e c i f i e d   a   2 n d   a r g ,   t h e n   t h i s   m u s t   b e   t h e   e x t e r n a l   d i s p l a y A  E F E l  ) )�� G H��   G G A this should only be passed in if it's an Xcode 6.x iOS Simulator    H � I I �   t h i s   s h o u l d   o n l y   b e   p a s s e d   i n   i f   i t ' s   a n   X c o d e   6 . x   i O S   S i m u l a t o r F  J�� J Z   ) � K L���� K ?  ) 0 M N M l  ) . O���� O I  ) .�� P��
�� .corecnte****       **** P o   ) *���� 0 argv  ��  ��  ��   N m   . /����  L k   3 � Q Q  R S R r   3 9 T U T n   3 7 V W V 4   4 7�� X
�� 
cobj X m   5 6����  W o   3 4���� 0 argv   U o      ���� 0 ext_display   S  Y Z Y e   : ? [ [ I  : ?�� \��
�� .fndrgstl****    ��� **** \ m   : ; ] ] � ^ ^  s y s v��   Z  _ ` _ r   @ E a b a A  @ C c d c 1   @ A��
�� 
rslt d m   A B����� b o      ���� 
0 legacy   `  e f e l  F F��������  ��  ��   f  g�� g O   F � h i h Z   J � j k���� j 1   J N��
�� 
uien k O   Q � l m l O   X � n o n k   b � p p  q r q I  b g������
�� .prcsclicnull��� ��� uiel��  ��   r  s�� s O   h � t u t k   x � v v  w x w I  x }������
�� .prcsclicnull��� ��� uiel��  ��   x  y�� y I  ~ ��� z��
�� .prcsclicnull��� ��� uiel z n   ~ � { | { 4   � ��� }
�� 
menI } o   � ����� 0 ext_display   | 4   ~ ��� ~
�� 
menE ~ m   � ����� ��  ��   u n   h u  �  4   n u�� �
�� 
menI � m   q t � � � � � " E x t e r n a l   D i s p l a y s � 4   h n�� �
�� 
menE � m   l m���� ��   o n   X _ � � � 4   \ _�� �
�� 
mbri � m   ] ^ � � � � �  H a r d w a r e � 4   X \�� �
�� 
mbar � m   Z [����  m 4   Q U�� �
�� 
prcs � o   S T���� 0 	simulator  ��  ��   i m   F G � ��                                                                                  sevs  alis    \  Macintosh HD                   BD ����System Events.app                                              ����            ����  
 cu             CoreServices  0/:System:Library:CoreServices:System Events.app/  $  S y s t e m   E v e n t s . a p p    M a c i n t o s h   H D  -System/Library/CoreServices/System Events.app   / ��  ��  ��  ��  ��   5 4     �� �
�� 
capp � o    ���� 0 	simulator  ��  ��  ��  ��  ��  ��     ��� � l     ��������  ��  ��  ��       �� � ���   � ��
�� .aevtoappnull  �   � **** � �� ���� � ���
�� .aevtoappnull  �   � ****�� 0 argv  ��   � ���������� 0 argv  �� 0 	simulator  �� 0 ext_display  �� 
0 legacy   � ���������� ]������ ��������� ������� �
�� .corecnte****       ****
�� 
cobj
�� 
capp
�� 
prun
�� .miscactvnull��� ��� null
�� .fndrgstl****    ��� ****
�� 
rslt���
�� 
uien
�� 
prcs
�� 
mbar
�� 
mbri
�� .prcsclicnull��� ��� uiel
�� 
menE
�� 
menI�� ��j  j ���k/E�O*�/�,e  �*�/ x*j O�j  k g��l/E�O�j O��E�O� L*�,E D*�/ 9*�k/��/ .*j O*a k/a a / *j O*a k/a �/j UUUY hUY hUY hY h ascr  ��ޭ