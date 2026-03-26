import { useState, useRef } from 'react';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../contexts/AuthContext';
import { Search, ShoppingCart, X, Plus, Minus, ChevronLeft, Star, Clock, MapPin, Check, Pill } from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────
interface FoodItem {
  id: string;
  name: string;
  description: string;
  ingredients: string;
  price: number;
  image_url: string;
  category: string;
  restaurant_name: string;
  restaurant_id: string;
  estimated_minutes: number;
  rating: number;
  is_available: boolean;
}

interface CartItem extends FoodItem { qty: number; }
type Screen = 'home' | 'food' | 'shop' | 'pharmacy' | 'detail' | 'cart' | 'checkout' | 'success';
type FilterType = 'all' | 'popular' | 'fast' | 'cheap';

// ── Food categories ───────────────────────────────────────────────────────────
const FOOD_CATEGORIES = [
  { id: 'all',       emoji: '🍽️', label: 'All'       },
  { id: 'combo',     emoji: '🍱', label: 'All Combos' },
  { id: 'combo_1p',  emoji: '🧍', label: 'Solo'       },
  { id: 'combo_2p',  emoji: '👫', label: 'For 2'      },
  { id: 'combo_3p',  emoji: '👨‍👩‍👦', label: 'For 3+'  },
  { id: 'fast_food', emoji: '🍔', label: 'Fast Food'  },
  { id: 'local',     emoji: '🍛', label: 'Local'      },
  { id: 'snacks',    emoji: '🍿', label: 'Snacks'     },
  { id: 'desserts',  emoji: '🍰', label: 'Desserts'   },
];

// ── Demo food items ───────────────────────────────────────────────────────────
const DEMO_FOODS: FoodItem[] = [
  // existing
  { id: '1',  name: 'Brochettes',           description: 'Grilled meat skewers — a Rwandan classic served with chips and salad.',        ingredients: 'Beef, onions, peppers, spices, chips',                  price: 2500, image_url: 'https://images.unsplash.com/photo-1544025162-d76694265947?w=400', category: 'local',     restaurant_name: 'Mama Cantine',   restaurant_id: 'r1', estimated_minutes: 20, rating: 4.8, is_available: true },
  { id: '2',  name: 'Isombe na Ibinyobwa',  description: 'Traditional cassava leaves cooked with groundnuts and spices.',                ingredients: 'Cassava leaves, groundnuts, onion, palm oil, spices',   price: 1800, image_url: 'https://images.unsplash.com/photo-1604329760661-e71dc83f8f26?w=400', category: 'local',     restaurant_name: 'Inzozi Kitchen', restaurant_id: 'r2', estimated_minutes: 30, rating: 4.6, is_available: true },
  { id: '3',  name: 'Chicken Burger',       description: 'Crispy chicken burger with lettuce, tomato and special sauce.',                ingredients: 'Chicken fillet, bun, lettuce, tomato, sauce',           price: 4500, image_url: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=400', category: 'fast_food', restaurant_name: 'Quick Bites KG', restaurant_id: 'r3', estimated_minutes: 15, rating: 4.4, is_available: true },
  { id: '4',  name: 'Samosas (3 pcs)',      description: 'Crispy fried samosas filled with spiced vegetables.',                          ingredients: 'Flour, potatoes, peas, onion, spices',                 price: 1200, image_url: 'https://images.unsplash.com/photo-1601050690597-df0568f70950?w=400', category: 'snacks',    restaurant_name: 'Spice Corner',   restaurant_id: 'r4', estimated_minutes: 10, rating: 4.5, is_available: true },
  { id: '6',  name: 'Chocolate Cake Slice', description: 'Rich chocolate cake with cream frosting.',                                     ingredients: 'Chocolate, flour, eggs, butter, cream',                price: 3000, image_url: 'https://images.unsplash.com/photo-1578985545062-69928b1d9587?w=400', category: 'desserts',  restaurant_name: 'Sweet Dreams',   restaurant_id: 'r6', estimated_minutes: 5,  rating: 4.7, is_available: true },
  { id: '7',  name: 'Pizza Margherita',     description: 'Classic pizza with tomato sauce and mozzarella.',                              ingredients: 'Dough, tomato, mozzarella, basil, olive oil',          price: 8000, image_url: 'https://images.unsplash.com/photo-1574071318508-1cdbab80d002?w=400', category: 'fast_food', restaurant_name: 'Roma Pizza',      restaurant_id: 'r7', estimated_minutes: 25, rating: 4.3, is_available: true },
  { id: '8',  name: 'Ugali na Nyama',       description: 'Stiff maize porridge served with beef stew.',                                 ingredients: 'Maize flour, beef, tomatoes, onion, spices',           price: 2000, image_url: 'https://images.unsplash.com/photo-1604329760661-e71dc83f8f26?w=400', category: 'local',     restaurant_name: 'Mama Cantine',   restaurant_id: 'r1', estimated_minutes: 25, rating: 4.5, is_available: true },
  // combos
  { id: 'c1', name: 'Burger + Fries + Soda',          description: 'Juicy beef burger with crispy fries and a cold soda. Perfect meal deal.',               ingredients: 'Beef patty, bun, lettuce, tomato, fries, soda 330ml',          price: 6500, image_url: 'https://images.unsplash.com/photo-1550317138-10000687a72b?w=400', category: 'combo', restaurant_name: 'Quick Bites KG',  restaurant_id: 'r3', estimated_minutes: 20, rating: 4.7, is_available: true },
  { id: 'c2', name: 'Chicken + Rice + Juice',         description: 'Grilled chicken thigh with seasoned rice and fresh juice — balanced and filling.',       ingredients: 'Grilled chicken, seasoned rice, vegetables, juice 500ml',      price: 5500, image_url: 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=400', category: 'combo', restaurant_name: 'Mama Cantine',    restaurant_id: 'r1', estimated_minutes: 25, rating: 4.8, is_available: true },
  { id: 'c3', name: 'Brochettes + Chips + Beer',      description: 'Classic Rwandan brochettes with golden chips and a cold beer — Friday night sorted.',   ingredients: 'Beef skewers, chips, Primus/Mutzig 500ml',                     price: 7000, image_url: 'https://images.unsplash.com/photo-1544025162-d76694265947?w=400', category: 'combo', restaurant_name: 'Mama Cantine',    restaurant_id: 'r1', estimated_minutes: 25, rating: 4.9, is_available: true },
  { id: 'c4', name: 'Pizza Slice + Salad + Soda',     description: 'Two slices of margherita pizza with fresh garden salad and a cold soda.',               ingredients: 'Pizza x2, garden salad, soda 330ml',                          price: 7500, image_url: 'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=400', category: 'combo', restaurant_name: 'Roma Pizza',       restaurant_id: 'r7', estimated_minutes: 20, rating: 4.5, is_available: true },
  { id: 'c5', name: 'Breakfast Box',                  description: 'Eggs, bread, avocado, sausage and tea — a full Rwandan breakfast delivered hot.',        ingredients: 'Eggs x2, bread, avocado, sausage x2, tea/coffee',             price: 4000, image_url: 'https://images.unsplash.com/photo-1533089860892-a7c6f0a88666?w=400', category: 'combo', restaurant_name: 'Inzozi Kitchen',  restaurant_id: 'r2', estimated_minutes: 15, rating: 4.6, is_available: true },
  { id: 'c6', name: 'Family Feast Box',               description: 'Feeds 3–4 people. Rice, beans, brochettes, salad and soft drinks for the whole family.', ingredients: 'Rice 1kg, beans, brochettes x8, salad, sodas x3',             price: 18000, image_url: 'https://images.unsplash.com/photo-1567620905732-2d1ec7ab7445?w=400', category: 'combo', restaurant_name: 'Mama Cantine',   restaurant_id: 'r1', estimated_minutes: 35, rating: 4.8, is_available: true },
  { id: 'c7', name: 'Shawarma + Fries + Juice',       description: 'Loaded chicken shawarma wrap with fries and fresh mango juice.',                          ingredients: 'Chicken shawarma, fries, mango juice 500ml',                  price: 6000, image_url: 'https://images.unsplash.com/photo-1561651188-d207bbec4ec3?w=400', category: 'combo', restaurant_name: 'Quick Bites KG',  restaurant_id: 'r3', estimated_minutes: 15, rating: 4.6, is_available: true },
  { id: 'c8', name: 'Veggie Combo',                   description: 'Isombe, ibitoki (plantains), salad and fresh passion juice — 100% plant-based.',          ingredients: 'Isombe, plantains, salad, passion juice',                     price: 4500, image_url: 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=400', category: 'combo', restaurant_name: 'Inzozi Kitchen',  restaurant_id: 'r2', estimated_minutes: 20, rating: 4.5, is_available: true },
  { id: 'c9', name: 'Late Night Snack Box',           description: 'Samosas x4, chicken wings x4, chips and a dipping sauce. Great for late nights.',         ingredients: 'Samosas, chicken wings, chips, sauces',                       price: 5500, image_url: 'https://images.unsplash.com/photo-1527477396000-e27163b481c2?w=400', category: 'combo', restaurant_name: 'Spice Corner',    restaurant_id: 'r4', estimated_minutes: 20, rating: 4.7, is_available: true },
  { id: 'c10',name: 'Office Lunch Deal',              description: 'Rice, stew, salad and juice — clean, filling, and delivered to your desk.',               ingredients: 'Rice, beef stew, vegetable salad, juice 500ml',               price: 4800, image_url: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=400', category: 'combo', restaurant_name: 'Mama Cantine',    restaurant_id: 'r1', estimated_minutes: 20, rating: 4.8, is_available: true },

  // ── 🧍 Solo Combos (1 person) ─────────────────────────────────────────────
  { id: 's01', name: 'Solo Burger Combo',          description: 'Juicy burger, golden fries and an ice-cold Coca-Cola. The perfect solo meal.',            ingredients: '1 Burger, 1 Fries, 1 Coca-Cola 330ml',                               price: 6500,  image_url: 'https://images.unsplash.com/photo-1550317138-10000687a72b?w=400', category: 'combo_1p', restaurant_name: 'Quick Bites KG',  restaurant_id: 'r3', estimated_minutes: 15, rating: 4.7, is_available: true },
  { id: 's02', name: 'Chicken Stick Combo',        description: '4 crispy chicken sticks, fries and a soft drink. Light and satisfying.',                  ingredients: '4 Chicken Sticks, 1 Fries, 1 Soft Drink',                            price: 5500,  image_url: 'https://images.unsplash.com/photo-1562967914-608f82629710?w=400', category: 'combo_1p', restaurant_name: 'Quick Bites KG',  restaurant_id: 'r3', estimated_minutes: 15, rating: 4.5, is_available: true },
  { id: 's03', name: 'Wings Lover Combo',          description: '6 crispy chicken wings, fries and a cold Coke. Perfect for wing fans.',                   ingredients: '6 Chicken Wings, 1 Fries, 1 Coca-Cola 330ml',                        price: 6000,  image_url: 'https://images.unsplash.com/photo-1567620832903-9fc6debc209f?w=400', category: 'combo_1p', restaurant_name: 'Spice Corner',    restaurant_id: 'r4', estimated_minutes: 15, rating: 4.6, is_available: true },
  { id: 's04', name: 'Light Meal Combo',           description: 'Fresh salad, 3 wings and a soft drink. The healthy choice that still hits.',              ingredients: '1 Salad, 3 Chicken Wings, 1 Soft Drink',                             price: 4800,  image_url: 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=400', category: 'combo_1p', restaurant_name: 'Inzozi Kitchen',  restaurant_id: 'r2', estimated_minutes: 10, rating: 4.4, is_available: true },
  { id: 's05', name: 'Pizza Slice Combo',          description: 'Personal pizza, fries and a Coke. Simple, delicious, done.',                              ingredients: '1 Personal Pizza, 1 Fries, 1 Coca-Cola 330ml',                       price: 7000,  image_url: 'https://images.unsplash.com/photo-1574071318508-1cdbab80d002?w=400', category: 'combo_1p', restaurant_name: 'Roma Pizza',      restaurant_id: 'r7', estimated_minutes: 20, rating: 4.5, is_available: true },
  { id: 's06', name: 'Beer Snack Combo 🍺',        description: '5 wings, fries and a cold beer. The ultimate Friday solo treat.',                         ingredients: '5 Chicken Wings, 1 Fries, 1 Beer (Primus/Mutzig)',                   price: 6500,  image_url: 'https://images.unsplash.com/photo-1527477396000-e27163b481c2?w=400', category: 'combo_1p', restaurant_name: 'Spice Corner',    restaurant_id: 'r4', estimated_minutes: 15, rating: 4.8, is_available: true },
  { id: 's07', name: 'Big Appetite Combo',         description: 'Burger, 3 wings, fries and a soft drink. For when you are seriously hungry.',             ingredients: '1 Burger, 3 Chicken Wings, 1 Fries, 1 Soft Drink',                  price: 8500,  image_url: 'https://images.unsplash.com/photo-1586190848861-99aa4a171e90?w=400', category: 'combo_1p', restaurant_name: 'Quick Bites KG',  restaurant_id: 'r3', estimated_minutes: 20, rating: 4.7, is_available: true },

  // ── 👫 Combos for 2 People ────────────────────────────────────────────────
  { id: 'd01', name: 'Couple Burger Combo',        description: 'Two burgers, two fries, two Cokes. A classic date night done right.',                     ingredients: '2 Burgers, 2 Fries, 2 Coca-Colas',                                  price: 13000, image_url: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=400', category: 'combo_2p', restaurant_name: 'Quick Bites KG',  restaurant_id: 'r3', estimated_minutes: 20, rating: 4.8, is_available: true },
  { id: 'd02', name: 'Wings & Fries Combo',        description: '10 crispy wings, two fries and soft drinks. Perfect game night for two.',                 ingredients: '10 Chicken Wings, 2 Fries, 2 Soft Drinks',                           price: 11000, image_url: 'https://images.unsplash.com/photo-1567620832903-9fc6debc209f?w=400', category: 'combo_2p', restaurant_name: 'Spice Corner',    restaurant_id: 'r4', estimated_minutes: 20, rating: 4.6, is_available: true },
  { id: 'd03', name: 'Pizza Date Combo 🍕',        description: 'One medium pizza, fries and two Cokes. Share something special.',                         ingredients: '1 Medium Pizza, 1 Fries, 2 Coca-Colas',                             price: 12000, image_url: 'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=400', category: 'combo_2p', restaurant_name: 'Roma Pizza',      restaurant_id: 'r7', estimated_minutes: 25, rating: 4.7, is_available: true },
  { id: 'd04', name: 'Chicken Lovers Combo',       description: '6 sticks and 8 wings with two soft drinks. For the duo that loves chicken.',              ingredients: '6 Chicken Sticks, 8 Chicken Wings, 2 Soft Drinks',                  price: 13500, image_url: 'https://images.unsplash.com/photo-1562967914-608f82629710?w=400', category: 'combo_2p', restaurant_name: 'Quick Bites KG',  restaurant_id: 'r3', estimated_minutes: 20, rating: 4.6, is_available: true },
  { id: 'd05', name: 'Light Sharing Combo',        description: 'Two fresh salads, 6 wings and soft drinks. Light, fresh and perfect to share.',           ingredients: '2 Salads, 6 Chicken Wings, 2 Soft Drinks',                           price: 10000, image_url: 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=400', category: 'combo_2p', restaurant_name: 'Inzozi Kitchen',  restaurant_id: 'r2', estimated_minutes: 15, rating: 4.5, is_available: true },
  { id: 'd06', name: 'Beer & Wings Combo 🍺',      description: '12 wings, fries and two cold beers. The perfect pair for the perfect pair.',              ingredients: '12 Chicken Wings, 1 Fries, 2 Beers (Primus/Mutzig)',                price: 14000, image_url: 'https://images.unsplash.com/photo-1567620832903-9fc6debc209f?w=400', category: 'combo_2p', restaurant_name: 'Spice Corner',    restaurant_id: 'r4', estimated_minutes: 20, rating: 4.9, is_available: true },
  { id: 'd07', name: 'Burger & Pizza Combo',       description: 'Medium pizza plus a burger with two soft drinks. Two favourites, one order.',              ingredients: '1 Medium Pizza, 1 Burger, 2 Soft Drinks',                            price: 14500, image_url: 'https://images.unsplash.com/photo-1550317138-10000687a72b?w=400', category: 'combo_2p', restaurant_name: 'Quick Bites KG',  restaurant_id: 'r3', estimated_minutes: 25, rating: 4.7, is_available: true },

  // ── 👨‍👩‍👦 Combos for 3 People ──────────────────────────────────────────────
  { id: 't01', name: 'Friends Burger Combo',       description: 'Three burgers, three fries and three Cokes. Simple, satisfying, sorted.',                 ingredients: '3 Burgers, 3 Fries, 3 Coca-Colas',                                  price: 19500, image_url: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=400', category: 'combo_3p', restaurant_name: 'Quick Bites KG',  restaurant_id: 'r3', estimated_minutes: 25, rating: 4.7, is_available: true },
  { id: 't02', name: 'Pizza Party Combo 🍕',       description: 'Large pizza, 6 wings and three soft drinks. Feed the crew right.',                        ingredients: '1 Large Pizza, 6 Chicken Wings, 3 Soft Drinks',                      price: 18000, image_url: 'https://images.unsplash.com/photo-1574071318508-1cdbab80d002?w=400', category: 'combo_3p', restaurant_name: 'Roma Pizza',      restaurant_id: 'r7', estimated_minutes: 30, rating: 4.8, is_available: true },
  { id: 't03', name: 'Chicken Feast Combo',        description: '10 wings and 8 sticks, two fries and three soft drinks. Chicken overload for three.',     ingredients: '10 Chicken Wings, 8 Chicken Sticks, 2 Fries, 3 Soft Drinks',        price: 22000, image_url: 'https://images.unsplash.com/photo-1562967914-608f82629710?w=400', category: 'combo_3p', restaurant_name: 'Spice Corner',    restaurant_id: 'r4', estimated_minutes: 30, rating: 4.8, is_available: true },
  { id: 't04', name: 'Mixed Grill Combo',          description: '2 burgers, 8 wings, 4 sticks and three soft drinks. Mixed grill heaven for three.',       ingredients: '2 Burgers, 8 Chicken Wings, 4 Chicken Sticks, 3 Soft Drinks',       price: 24000, image_url: 'https://images.unsplash.com/photo-1586190848861-99aa4a171e90?w=400', category: 'combo_3p', restaurant_name: 'Quick Bites KG',  restaurant_id: 'r3', estimated_minutes: 30, rating: 4.7, is_available: true },
  { id: 't05', name: 'Beer Friends Combo 🍺',      description: '15 wings, two fries and three cold beers. The squad needs this.',                         ingredients: '15 Chicken Wings, 2 Fries, 3 Beers (Primus/Mutzig)',                price: 21000, image_url: 'https://images.unsplash.com/photo-1527477396000-e27163b481c2?w=400', category: 'combo_3p', restaurant_name: 'Spice Corner',    restaurant_id: 'r4', estimated_minutes: 30, rating: 4.9, is_available: true },
  { id: 't06', name: 'Ultimate Sharing Combo 🔥',  description: 'Large pizza, 2 burgers, 10 wings, 2 fries and 3 soft drinks. The full spread.',           ingredients: '1 Large Pizza, 2 Burgers, 10 Chicken Wings, 2 Fries, 3 Soft Drinks', price: 32000, image_url: 'https://images.unsplash.com/photo-1567620905732-2d1ec7ab7445?w=400', category: 'combo_3p', restaurant_name: 'Quick Bites KG',  restaurant_id: 'r3', estimated_minutes: 35, rating: 5.0, is_available: true },
];

// ── Shop items (drinks only) ──────────────────────────────────────────────────
interface ShopItem {
  id: string;
  name: string;
  description: string;
  price: number;
  image_url: string;
  subcategory: 'beer' | 'soda' | 'soft';
  volume: string;
  brand: string;
}

const SHOP_ITEMS: ShopItem[] = [
  // beers
  { id: 's1',  name: 'Primus',           description: 'Rwanda\'s most popular lager. Cold, crisp and refreshing.',            price: 800,  image_url: 'https://images.unsplash.com/photo-1608270586620-248524c67de9?w=400', subcategory: 'beer', volume: '500ml', brand: 'Bralirwa' },
  { id: 's2',  name: 'Mutzig',           description: 'Premium Rwandan beer with a smooth taste.',                             price: 900,  image_url: 'https://images.unsplash.com/photo-1518176258769-f227c798150e?w=400', subcategory: 'beer', volume: '500ml', brand: 'Bralirwa' },
  { id: 's3',  name: 'Heineken',         description: 'International premium lager, imported fresh.',                          price: 1500, image_url: 'https://images.unsplash.com/photo-1584225064785-c62a8b43d148?w=400', subcategory: 'beer', volume: '330ml', brand: 'Heineken' },
  { id: 's4',  name: 'Amstel',           description: 'Light refreshing lager. Great for any occasion.',                      price: 1200, image_url: 'https://images.unsplash.com/photo-1535958636474-b021ee887b13?w=400', subcategory: 'beer', volume: '330ml', brand: 'Heineken' },
  { id: 's5',  name: 'Guinness',         description: 'Rich dark stout with creamy head and roasted malt flavour.',           price: 1400, image_url: 'https://images.unsplash.com/photo-1566633806827-5de9e4135bc0?w=400', subcategory: 'beer', volume: '500ml', brand: 'Diageo' },
  // sodas
  { id: 's6',  name: 'Coca-Cola',        description: 'Ice cold Coke — the classic.',                                         price: 500,  image_url: 'https://images.unsplash.com/photo-1554866585-cd94860890b7?w=400', subcategory: 'soda', volume: '500ml', brand: 'Coca-Cola' },
  { id: 's7',  name: 'Fanta Orange',     description: 'Fizzy orange soda, perfect ice cold.',                                 price: 500,  image_url: 'https://images.unsplash.com/photo-1624517452488-04d8a8a74dcc?w=400', subcategory: 'soda', volume: '500ml', brand: 'Coca-Cola' },
  { id: 's8',  name: 'Sprite',           description: 'Clean lemon-lime taste. No caffeine.',                                 price: 500,  image_url: 'https://images.unsplash.com/photo-1625772299848-391b6a87d7b3?w=400', subcategory: 'soda', volume: '500ml', brand: 'Coca-Cola' },
  { id: 's9',  name: 'Pepsi',            description: 'Bold refreshing cola taste.',                                           price: 500,  image_url: 'https://images.unsplash.com/photo-1629203851122-3726ecdf080e?w=400', subcategory: 'soda', volume: '500ml', brand: 'PepsiCo' },
  { id: 's10', name: 'Tonic Water',      description: 'Schweppes classic tonic. Great with gin or on its own.',               price: 700,  image_url: 'https://images.unsplash.com/photo-1546171753-97d7676e4602?w=400', subcategory: 'soda', volume: '330ml', brand: 'Schweppes' },
  // soft drinks
  { id: 's11', name: 'Fresh Passion Juice',   description: 'Locally squeezed passion fruit juice. No preservatives.',         price: 1000, image_url: 'https://images.unsplash.com/photo-1600271886742-f049cd451bba?w=400', subcategory: 'soft', volume: '500ml', brand: 'Local' },
  { id: 's12', name: 'Fresh Mango Juice',     description: 'Cold freshly squeezed mango juice from Rwanda.',                  price: 1000, image_url: 'https://images.unsplash.com/photo-1546173159-315724a31696?w=400', subcategory: 'soft', volume: '500ml', brand: 'Local' },
  { id: 's13', name: 'Inyange Milk',          description: 'Fresh cold Inyange whole milk.',                                  price: 800,  image_url: 'https://images.unsplash.com/photo-1550583724-b2692b85b150?w=400', subcategory: 'soft', volume: '500ml', brand: 'Inyange' },
  { id: 's14', name: 'Red Bull',              description: 'Energy drink for when you need a boost.',                         price: 2000, image_url: 'https://images.unsplash.com/photo-1551538827-9c037cb4f32a?w=400', subcategory: 'soft', volume: '250ml', brand: 'Red Bull' },
  { id: 's15', name: 'Still Water (1.5L)',    description: 'Clean drinking water. Inyange or Gasabo.',                        price: 600,  image_url: 'https://images.unsplash.com/photo-1548839140-29a749e1cf4d?w=400', subcategory: 'soft', volume: '1.5L',  brand: 'Inyange' },
];

// ── Pharmacy items ────────────────────────────────────────────────────────────
interface PharmItem {
  id: string;
  name: string;
  description: string;
  usage: string;
  price: number;
  image_url: string;
  subcategory: 'sexual' | 'pain' | 'cold' | 'stomach' | 'skin';
  sensitive: boolean;
  pack: string;
}

const PHARM_ITEMS: PharmItem[] = [
  // sexual health - sensitive
  { id: 'p1',  name: 'Condoms — Male (3 pack)',        description: 'Standard latex condoms. Protection against STIs and unwanted pregnancy.',          usage: 'Use 1 per sexual encounter. Check expiry date.',                             price: 1000, image_url: 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=400', subcategory: 'sexual',  sensitive: true,  pack: '3 pcs' },
  { id: 'p2',  name: 'Condoms — Male (12 pack)',       description: 'Value pack of latex condoms. Discreetly packaged, delivered to your door.',         usage: 'Use 1 per sexual encounter. Check expiry date.',                             price: 3000, image_url: 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=400', subcategory: 'sexual',  sensitive: true,  pack: '12 pcs' },
  { id: 'p3',  name: 'Female Condom (2 pack)',         description: 'Internal condom — female controlled protection. Works before and after.',            usage: 'Insert before sex. Can be inserted up to 8 hours before.',                  price: 1500, image_url: 'https://images.unsplash.com/photo-1559757175-0eb30cd8c063?w=400', subcategory: 'sexual',  sensitive: true,  pack: '2 pcs' },
  { id: 'p4',  name: 'Emergency Contraceptive (Pill)', description: 'Morning-after pill. Prevents pregnancy if taken within 72 hours after unprotected sex. NOT an abortion pill.', usage: 'Take 1 tablet as soon as possible after unprotected sex. Within 72 hrs.',   price: 2500, image_url: 'https://images.unsplash.com/photo-1550572017-edd951b55104?w=400', subcategory: 'sexual',  sensitive: true,  pack: '1 tablet' },
  { id: 'p5',  name: 'Postinor-2 (Levonorgestrel)',   description: 'Two-dose emergency contraceptive. Take first tablet ASAP, second 12 hours later.',  usage: 'Tablet 1 immediately, tablet 2 after 12 hours. Within 72 hrs of sex.',     price: 3000, image_url: 'https://images.unsplash.com/photo-1550572017-edd951b55104?w=400', subcategory: 'sexual',  sensitive: true,  pack: '2 tablets' },
  { id: 'p6',  name: 'Lubricant Gel (50ml)',           description: 'Water-based personal lubricant. Reduces friction, compatible with condoms.',         usage: 'Apply to condom or body as needed. Do not use oil-based with latex.',       price: 2000, image_url: 'https://images.unsplash.com/photo-1559757175-0eb30cd8c063?w=400', subcategory: 'sexual',  sensitive: true,  pack: '50ml' },
  { id: 'p7',  name: 'Pregnancy Test',                 description: 'Fast and accurate home pregnancy test. Results in 5 minutes.',                       usage: 'Use first morning urine. Dip for 5 seconds, read in 5 min.',                price: 1500, image_url: 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=400', subcategory: 'sexual',  sensitive: true,  pack: '1 test' },
  // pain killers
  { id: 'p8',  name: 'Paracetamol 500mg',             description: 'Relieves headaches, fever, muscle pain and general body aches.',                     usage: 'Adults: 1–2 tablets every 4–6 hours. Max 8 tablets/day.',                  price: 500,  image_url: 'https://images.unsplash.com/photo-1550572017-edd951b55104?w=400', subcategory: 'pain',    sensitive: false, pack: '10 tabs' },
  { id: 'p9',  name: 'Ibuprofen 400mg',               description: 'Anti-inflammatory. Good for period pain, toothache, headache and swelling.',         usage: 'Adults: 1 tablet every 6–8 hours with food. Max 3/day.',                   price: 700,  image_url: 'https://images.unsplash.com/photo-1576671081837-49000212a370?w=400', subcategory: 'pain',    sensitive: false, pack: '10 tabs' },
  { id: 'p10', name: 'Aspirin 300mg',                  description: 'Pain relief and fever reducer. Also used for heart protection at low doses.',         usage: 'Adults: 1–3 tablets every 4 hours. Take with food.',                       price: 400,  image_url: 'https://images.unsplash.com/photo-1550572017-edd951b55104?w=400', subcategory: 'pain',    sensitive: false, pack: '10 tabs' },
  { id: 'p11', name: 'Voltaren Gel (50g)',             description: 'Topical anti-inflammatory gel. Rub on joints, back pain and muscle soreness.',        usage: 'Apply 2–4g to affected area 3–4 times daily. Do not use on wounds.',       price: 4500, image_url: 'https://images.unsplash.com/photo-1576671081837-49000212a370?w=400', subcategory: 'pain',    sensitive: false, pack: '50g tube' },
  // cold & flu
  { id: 'p12', name: 'Actifed Cough Syrup',           description: 'Relieves cough, runny nose and congestion from cold and flu.',                        usage: 'Adults: 2 teaspoons every 4–6 hours. Do not exceed 8 teaspoons/day.',      price: 2500, image_url: 'https://images.unsplash.com/photo-1559056199-641a0ac8b55e?w=400', subcategory: 'cold',    sensitive: false, pack: '100ml' },
  { id: 'p13', name: 'Cetirizine (Antihistamine)',     description: 'Treats allergies, hay fever, itchy eyes and runny nose.',                             usage: 'Adults: 1 tablet once daily. Take at night to avoid drowsiness.',          price: 600,  image_url: 'https://images.unsplash.com/photo-1550572017-edd951b55104?w=400', subcategory: 'cold',    sensitive: false, pack: '10 tabs' },
  { id: 'p14', name: 'Strepsils Lozenges',             description: 'Soothing throat lozenges for sore throat and mouth infections.',                      usage: 'Dissolve 1 lozenge slowly in mouth every 2–3 hours. Max 8/day.',           price: 1200, image_url: 'https://images.unsplash.com/photo-1559056199-641a0ac8b55e?w=400', subcategory: 'cold',    sensitive: false, pack: '8 lozenges' },
  { id: 'p15', name: 'Vitamin C 500mg',               description: 'Boosts immune system. Helps fight colds and recover faster.',                         usage: '1 tablet daily. Dissolve in water or chew.',                               price: 800,  image_url: 'https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=400', subcategory: 'cold',    sensitive: false, pack: '10 tabs' },
  // stomach
  { id: 'p16', name: 'Oral Rehydration Salts (ORS)',  description: 'Replace fluids and minerals lost from diarrhoea or vomiting.',                        usage: 'Dissolve 1 sachet in 1 litre clean water. Drink throughout the day.',      price: 300,  image_url: 'https://images.unsplash.com/photo-1559056199-641a0ac8b55e?w=400', subcategory: 'stomach', sensitive: false, pack: '5 sachets' },
  { id: 'p17', name: 'Antacid (Gaviscon)',             description: 'Relieves heartburn, acid reflux and indigestion quickly.',                            usage: 'Adults: 2–4 tablets after meals and at bedtime.',                          price: 1500, image_url: 'https://images.unsplash.com/photo-1550572017-edd951b55104?w=400', subcategory: 'stomach', sensitive: false, pack: '16 tabs' },
  { id: 'p18', name: 'Buscopan (Stomach Cramps)',      description: 'Relieves stomach cramps, period pain and irritable bowel spasms.',                    usage: 'Adults: 1–2 tablets up to 3 times daily.',                                 price: 1200, image_url: 'https://images.unsplash.com/photo-1576671081837-49000212a370?w=400', subcategory: 'stomach', sensitive: false, pack: '10 tabs' },
];

// ── Sub-tabs for shop & pharmacy ─────────────────────────────────────────────
const SHOP_TABS    = [
  { id: 'all',  label: 'All Drinks', emoji: '🥤' },
  { id: 'beer', label: 'Beer 🍺',    emoji: '🍺' },
  { id: 'soda', label: 'Soda 🥤',   emoji: '🥤' },
  { id: 'soft', label: 'Juice & More', emoji: '🍹' },
];

const PHARM_TABS = [
  { id: 'all',     label: 'All',        emoji: '💊' },
  { id: 'sexual',  label: '❤️ Sexual Health', emoji: '❤️' },
  { id: 'pain',    label: 'Pain Relief', emoji: '🩹' },
  { id: 'cold',    label: 'Cold & Flu',  emoji: '🤧' },
  { id: 'stomach', label: 'Stomach',     emoji: '🫃' },
];

// ── Main component ────────────────────────────────────────────────────────────
export function ReceiverOrderView({ onClose }: { onClose?: () => void } = {}) {
  const { profile } = useAuth();

  const [screen,      setScreen]      = useState<Screen>('home');
  const [selected,    setSelected]    = useState<FoodItem | null>(null);
  const [cart,        setCart]        = useState<CartItem[]>([]);
  const [foodCat,     setFoodCat]     = useState('all');
  const [shopTab,     setShopTab]     = useState('all');
  const [pharmTab,    setPharmTab]    = useState('all');
  const [search,      setSearch]      = useState('');
  const [filter,      setFilter]      = useState<FilterType>('all');
  const [qty,         setQty]         = useState(1);
  const [address,     setAddress]     = useState((profile as any)?.location || '');
  const [walletBalance, setWalletBalance] = useState<number | null>(null);
  const [walletError,   setWalletError]   = useState('');
  const [placing,     setPlacing]     = useState(false);
  const [orderId,     setOrderId]     = useState('');
  const [pharmDetail, setPharmDetail] = useState<PharmItem | null>(null);
  const [shopDetail,  setShopDetail]  = useState<ShopItem | null>(null);

  const cartCount = cart.reduce((s, i) => s + i.qty, 0);
  const subtotal  = cart.reduce((s, i) => s + i.price * i.qty, 0);
  const deliveryFee = subtotal > 0 ? 500 : 0;
  const total     = subtotal + deliveryFee;

  const filteredFoods = DEMO_FOODS.filter(f => {
    const matchCat    = foodCat === 'all' || f.category === foodCat || (foodCat === 'combo' && f.category.startsWith('combo'));
    const matchSearch = !search || f.name.toLowerCase().includes(search.toLowerCase());
    const matchFilter = filter === 'all' ? true : filter === 'popular' ? f.rating >= 4.5 : filter === 'fast' ? f.estimated_minutes <= 15 : filter === 'cheap' ? f.price <= 2000 : true;
    return matchCat && matchSearch && matchFilter && f.is_available;
  });

  const filteredShop  = SHOP_ITEMS.filter(s => shopTab === 'all' || s.subcategory === shopTab);
  const filteredPharm = PHARM_ITEMS.filter(p => pharmTab === 'all' || p.subcategory === pharmTab);

  function addToCart(item: any, q = 1) {
    setCart(prev => {
      const ex = prev.find(c => c.id === item.id);
      if (ex) return prev.map(c => c.id === item.id ? { ...c, qty: c.qty + q } : c);
      return [...prev, { ...item, qty: q, category: item.subcategory || item.category || 'shop', restaurant_name: item.brand || item.subcategory || '', restaurant_id: '', estimated_minutes: 10, rating: 5, is_available: true, ingredients: item.usage || item.description || '', description: item.description || '' }];
    });
  }

  function updateQty(id: string, delta: number) {
    setCart(prev => prev.map(c => c.id === id ? { ...c, qty: Math.max(0, c.qty + delta) } : c).filter(c => c.qty > 0));
  }

  async function loadWallet() {
    if (!profile) return;
    const { data } = await supabase.from('profiles').select('wallet_balance').eq('id', profile.id).single();
    setWalletBalance(data?.wallet_balance ?? 0);
  }

  async function placeOrder() {
    if (!profile || cart.length === 0) return;
    setWalletError('');
    setPlacing(true);
    try {
      // Step 1: check balance manually first
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('wallet_balance')
        .eq('id', profile.id)
        .single();

      if (profileError) {
        setWalletError('Could not read wallet: ' + profileError.message);
        return;
      }

      const balance = profileData?.wallet_balance ?? 0;
      if (balance < total) {
        setWalletError(`Insufficient balance. You have ${balance.toLocaleString()} RWF but need ${total.toLocaleString()} RWF.`);
        setWalletBalance(balance);
        return;
      }

      // Step 2: deduct wallet
      const { error: deductError } = await supabase
        .from('profiles')
        .update({ wallet_balance: balance - total })
        .eq('id', profile.id);

      if (deductError) {
        setWalletError('Wallet deduction failed: ' + deductError.message);
        return;
      }

      // Step 3: insert food order
      const { data: orderData, error: orderError } = await supabase
        .from('food_orders')
        .insert({
          user_id:          profile.id,
          items:            cart.map(c => ({ id: c.id, name: c.name, qty: c.qty, price: c.price })),
          subtotal,
          delivery_fee:     deliveryFee,
          total,
          delivery_address: address,
          payment_method:   'wallet',
          status:           'pending',
        })
        .select('id')
        .single();

      if (orderError) {
        // Refund wallet if order insert failed
        await supabase.from('profiles').update({ wallet_balance: balance }).eq('id', profile.id);
        setWalletError('Order insert failed: ' + orderError.message);
        return;
      }

      // Step 4: log wallet transaction (non-blocking)
      supabase.from('wallet_transactions').insert({
        user_id:     profile.id,
        type:        'debit',
        amount:      total,
        status:      'completed',
        description: `Easy GO Shop order #${orderData.id.slice(0, 8)}`,
      }).then(() => {}).catch(() => {});

      // Push notify all on-duty drivers
      supabase.from('drivers').select('user_id').eq('is_on_duty', true).then(({ data: drivers }) => {
        if (drivers?.length) {
          supabase.functions.invoke('send-push', {
            body: {
              user_ids: drivers.map((d: any) => d.user_id),
              title:    '🛍️ New Shop Order!',
              body:     `${cart.length} item${cart.length > 1 ? 's' : ''} · ${total.toLocaleString()} RWF · ${address}`,
              url:      '/',
              tag:      'new-shop-order',
            },
          }).catch(() => {});
        }
      });

      setWalletBalance(balance - total);
      setOrderId(orderData.id.slice(0, 8));
      setCart([]);
      setScreen('success');

      // Watch shop order for real-time status — notify receiver
      const foodId = orderData.id;
      const foodCh = supabase.channel('food-order-' + foodId)
        .on('postgres_changes', {
          event: 'UPDATE', schema: 'public', table: 'food_orders',
          filter: `id=eq.${foodId}`,
        }, (payload: any) => {
          const upd = payload.new as any;
          if (upd.status === 'accepted') {
            const evt = new CustomEvent('easygo-push', {
              detail: { title: '🏍️ Driver Accepted Your Order!', body: `${upd.driver_name || 'Your driver'} is on the way to collect your items` }
            });
            window.dispatchEvent(evt);
          }
          if (upd.status === 'in_transit') {
            const evt = new CustomEvent('easygo-push', {
              detail: { title: '🚀 Order On The Way!', body: 'Driver has picked up your items and is heading to you' }
            });
            window.dispatchEvent(evt);
          }
          if (upd.status === 'delivered') {
            const evt = new CustomEvent('easygo-push', {
              detail: { title: '🎉 Order Arrived!', body: 'Your items have been delivered. Please confirm receipt.' }
            });
            window.dispatchEvent(evt);
            supabase.removeChannel(foodCh);
          }
        })
        .subscribe();

    } catch (e: any) {
      setWalletError('Unexpected error: ' + (e?.message || JSON.stringify(e)));
    } finally {
      setPlacing(false);
    }
  }

  // ── Shared header with cart button ────────────────────────────────────────
  function Header({ title, back }: { title: string; back: () => void }) {
    return (
      <div style={{ background: 'var(--bg2)', padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 100 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button onClick={back} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', display: 'flex' }}><ChevronLeft size={22} /></button>
          <h2 style={{ fontFamily: 'Space Grotesk, sans-serif', fontSize: '17px', fontWeight: 800, color: 'var(--text)' }}>{title}</h2>
        </div>
        <button onClick={() => setScreen('cart')} style={{ background: cartCount > 0 ? 'var(--yellow)' : 'var(--card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '7px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontFamily: 'Space Grotesk, sans-serif', fontWeight: 800, fontSize: '13px', color: cartCount > 0 ? '#080c14' : 'var(--text)' }}>
          <ShoppingCart size={15} />{cartCount > 0 && <span>{cartCount}</span>}
        </button>
      </div>
    );
  }

  // ── SUCCESS ───────────────────────────────────────────────────────────────
  if (screen === 'success') return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '32px 24px', textAlign: 'center' }}>
      <div style={{ fontSize: '64px', marginBottom: '16px' }}>🎉</div>
      <h2 style={{ fontFamily: 'Space Grotesk, sans-serif', fontSize: '24px', fontWeight: 800, color: 'var(--text)', marginBottom: '8px' }}>Order Placed!</h2>
      <p style={{ fontSize: '14px', color: 'var(--text3)', marginBottom: '6px' }}>Delivered discreetly to your door</p>
      <div style={{ background: 'rgba(245,197,24,0.1)', border: '1px solid rgba(245,197,24,0.3)', borderRadius: '12px', padding: '12px 24px', marginBottom: '24px' }}>
        <p style={{ fontSize: '12px', color: 'var(--text3)' }}>Order ID</p>
        <p style={{ fontSize: '20px', fontWeight: 800, color: 'var(--yellow)', fontFamily: 'monospace' }}>#{orderId}</p>
      </div>
      <button onClick={() => { setScreen('home'); setCart([]); }} style={{ padding: '13px 32px', background: 'var(--yellow)', border: 'none', borderRadius: '12px', fontWeight: 800, fontSize: '14px', color: '#080c14', cursor: 'pointer', fontFamily: 'Space Grotesk, sans-serif' }}>
        Back to Home
      </button>
    </div>
  );

  // ── CHECKOUT ─────────────────────────────────────────────────────────────
  if (screen === 'checkout') {
    if (walletBalance === null) loadWallet();
    return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', paddingBottom: '100px' }}>
      <Header title="Checkout" back={() => setScreen('cart')} />
      <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <div className="card">
          <p style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: '10px' }}>Order Summary</p>
          {cart.map(c => (
            <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
              <span style={{ fontSize: '13px', color: 'var(--text)' }}>{c.name} × {c.qty}</span>
              <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text)' }}>{(c.price * c.qty).toLocaleString()} RWF</span>
            </div>
          ))}
          <div style={{ borderTop: '1px solid var(--border)', marginTop: '10px', paddingTop: '10px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
              <span style={{ fontSize: '12px', color: 'var(--text3)' }}>Subtotal</span>
              <span style={{ fontSize: '12px', color: 'var(--text)' }}>{subtotal.toLocaleString()} RWF</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
              <span style={{ fontSize: '12px', color: 'var(--text3)' }}>Delivery fee</span>
              <span style={{ fontSize: '12px', color: 'var(--text)' }}>{deliveryFee.toLocaleString()} RWF</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '15px', fontWeight: 800, color: 'var(--text)' }}>Total</span>
              <span style={{ fontSize: '15px', fontWeight: 800, color: 'var(--yellow)' }}>{total.toLocaleString()} RWF</span>
            </div>
          </div>
        </div>
        <div className="card">
          <p style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: '10px' }}>📍 Delivery Address</p>
          <input value={address} onChange={e => setAddress(e.target.value)} placeholder="Enter your delivery address"
            style={{ width: '100%', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: '10px', padding: '11px 12px', fontSize: '13px', color: 'var(--text)', fontFamily: 'Space Grotesk, sans-serif', outline: 'none', boxSizing: 'border-box' }} />
        </div>
        <div className="card" onClick={loadWallet}>
          <p style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: '10px' }}>👛 Payment — Wallet</p>
          <div style={{ background: 'rgba(245,197,24,0.06)', border: '1px solid rgba(245,197,24,0.25)', borderRadius: '12px', padding: '14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <p style={{ fontSize: '12px', color: 'var(--text3)', marginBottom: '3px' }}>Available balance</p>
              <p style={{ fontSize: '22px', fontWeight: 800, color: 'var(--yellow)' }}>
                {walletBalance === null ? '…' : `${walletBalance.toLocaleString()} RWF`}
              </p>
            </div>
            <span style={{ fontSize: '36px' }}>👛</span>
          </div>
          {walletBalance !== null && walletBalance < total && (
            <p style={{ fontSize: '12px', color: 'var(--red, #ef4444)', marginTop: '8px', fontWeight: 600 }}>
              ⚠️ Insufficient balance — top up your wallet to continue
            </p>
          )}
          {walletError && (
            <p style={{ fontSize: '12px', color: 'var(--red, #ef4444)', marginTop: '8px', fontWeight: 600 }}>{walletError}</p>
          )}
        </div>
        <button onClick={placeOrder} disabled={placing || !address.trim()}
          style={{ width: '100%', padding: '15px', background: 'var(--yellow)', border: 'none', borderRadius: '14px', fontWeight: 800, fontSize: '16px', color: '#080c14', cursor: 'pointer', fontFamily: 'Space Grotesk, sans-serif', opacity: placing || !address.trim() || (walletBalance !== null && walletBalance < total) ? 0.6 : 1 }}>
          {placing ? '⏳ Placing Order…' : `🚀 Pay ${total.toLocaleString()} RWF from Wallet`}
        </button>
      </div>
    </div>
  );
  }

  // ── CART ─────────────────────────────────────────────────────────────────
  if (screen === 'cart') return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', paddingBottom: '100px' }}>
      <div style={{ background: 'var(--bg2)', padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 100 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button onClick={() => setScreen('home')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', display: 'flex' }}><ChevronLeft size={22} /></button>
          <h2 style={{ fontFamily: 'Space Grotesk, sans-serif', fontSize: '17px', fontWeight: 800, color: 'var(--text)' }}>🛒 Cart ({cartCount})</h2>
        </div>
        {cart.length > 0 && <button onClick={() => setCart([])} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '12px', color: 'var(--red)', fontFamily: 'Space Grotesk, sans-serif', fontWeight: 600 }}>Clear all</button>}
      </div>
      {cart.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 24px' }}>
          <p style={{ fontSize: '48px', marginBottom: '12px' }}>🛒</p>
          <p style={{ fontWeight: 700, fontSize: '16px', color: 'var(--text)', marginBottom: '8px' }}>Your cart is empty</p>
          <button onClick={() => setScreen('home')} style={{ padding: '12px 24px', background: 'var(--yellow)', border: 'none', borderRadius: '12px', fontWeight: 800, fontSize: '14px', color: '#080c14', cursor: 'pointer', fontFamily: 'Space Grotesk, sans-serif' }}>Browse</button>
        </div>
      ) : (
        <div style={{ padding: '16px' }}>
          {cart.map(item => (
            <div key={item.id} style={{ background: 'var(--card)', borderRadius: '14px', padding: '14px', marginBottom: '10px', border: '1px solid var(--border)', display: 'flex', gap: '12px', alignItems: 'center' }}>
              <img src={item.image_url} alt={item.name} style={{ width: '56px', height: '56px', borderRadius: '10px', objectFit: 'cover', flexShrink: 0 }} onError={e => { (e.target as HTMLImageElement).src = 'https://images.unsplash.com/photo-1550572017-edd951b55104?w=400'; }} />
              <div style={{ flex: 1 }}>
                <p style={{ fontWeight: 700, fontSize: '13px', color: 'var(--text)', marginBottom: '2px' }}>{item.name}</p>
                <p style={{ fontSize: '13px', fontWeight: 800, color: 'var(--yellow)' }}>{(item.price * item.qty).toLocaleString()} RWF</p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <button onClick={() => updateQty(item.id, -1)} style={{ width: '28px', height: '28px', borderRadius: '8px', background: 'var(--bg3)', border: '1px solid var(--border)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Minus size={12} color="var(--text)" /></button>
                <span style={{ fontSize: '15px', fontWeight: 800, color: 'var(--text)', minWidth: '16px', textAlign: 'center' }}>{item.qty}</span>
                <button onClick={() => updateQty(item.id, 1)} style={{ width: '28px', height: '28px', borderRadius: '8px', background: 'var(--yellow)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Plus size={12} color="#080c14" /></button>
              </div>
            </div>
          ))}
          <div className="card" style={{ marginTop: '8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}><span style={{ fontSize: '13px', color: 'var(--text3)' }}>Subtotal</span><span style={{ fontSize: '13px', color: 'var(--text)' }}>{subtotal.toLocaleString()} RWF</span></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}><span style={{ fontSize: '13px', color: 'var(--text3)' }}>Delivery</span><span style={{ fontSize: '13px', color: 'var(--text)' }}>{deliveryFee.toLocaleString()} RWF</span></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '10px', borderTop: '1px solid var(--border)' }}>
              <span style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text)' }}>Total</span>
              <span style={{ fontSize: '16px', fontWeight: 800, color: 'var(--yellow)' }}>{total.toLocaleString()} RWF</span>
            </div>
          </div>
          <button onClick={() => setScreen('checkout')} style={{ width: '100%', marginTop: '14px', padding: '15px', background: 'var(--yellow)', border: 'none', borderRadius: '14px', fontWeight: 800, fontSize: '16px', color: '#080c14', cursor: 'pointer', fontFamily: 'Space Grotesk, sans-serif' }}>
            Checkout →
          </button>
        </div>
      )}
    </div>
  );

  // ── FOOD DETAIL ───────────────────────────────────────────────────────────
  if (screen === 'detail' && selected) return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', paddingBottom: '100px' }}>
      <div style={{ position: 'relative' }}>
        <img src={selected.image_url} alt={selected.name} style={{ width: '100%', height: '240px', objectFit: 'cover' }} />
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, rgba(0,0,0,0.3) 0%, transparent 40%, rgba(8,12,20,0.8) 100%)' }} />
        <button onClick={() => setScreen('food')} style={{ position: 'absolute', top: '14px', left: '14px', background: 'rgba(0,0,0,0.5)', border: 'none', borderRadius: '50%', width: '36px', height: '36px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}><ChevronLeft size={20} /></button>
        {cartCount > 0 && <button onClick={() => setScreen('cart')} style={{ position: 'absolute', top: '14px', right: '14px', background: 'var(--yellow)', border: 'none', borderRadius: '20px', padding: '6px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontFamily: 'Space Grotesk, sans-serif', fontWeight: 800, fontSize: '13px', color: '#080c14' }}><ShoppingCart size={14} />{cartCount}</button>}
      </div>
      <div style={{ padding: '18px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
          <h2 style={{ fontFamily: 'Space Grotesk, sans-serif', fontSize: '20px', fontWeight: 800, color: 'var(--text)', flex: 1, marginRight: '12px' }}>{selected.name}</h2>
          <p style={{ fontFamily: 'Space Grotesk, sans-serif', fontSize: '20px', fontWeight: 800, color: 'var(--yellow)', whiteSpace: 'nowrap' }}>{selected.price.toLocaleString()} RWF</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Star size={12} color="#f5c518" fill="#f5c518" /><span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text)' }}>{selected.rating}</span></div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Clock size={12} color="var(--text3)" /><span style={{ fontSize: '12px', color: 'var(--text3)' }}>{selected.estimated_minutes} min</span></div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><MapPin size={12} color="var(--text3)" /><span style={{ fontSize: '12px', color: 'var(--text3)' }}>{selected.restaurant_name}</span></div>
        </div>
        <p style={{ fontSize: '13px', color: 'var(--text)', lineHeight: 1.6, marginBottom: '14px' }}>{selected.description}</p>
        {selected.ingredients && (
          <div className="card" style={{ marginBottom: '14px' }}>
            <p style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: '6px' }}>🥗 Ingredients / What's inside</p>
            <p style={{ fontSize: '13px', color: 'var(--text)', lineHeight: 1.6 }}>{selected.ingredients}</p>
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <p style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text)' }}>Quantity</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button onClick={() => setQty(q => Math.max(1, q - 1))} style={{ width: '34px', height: '34px', borderRadius: '10px', background: 'var(--bg3)', border: '1px solid var(--border)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Minus size={13} color="var(--text)" /></button>
            <span style={{ fontSize: '20px', fontWeight: 800, color: 'var(--text)', minWidth: '24px', textAlign: 'center' }}>{qty}</span>
            <button onClick={() => setQty(q => q + 1)} style={{ width: '34px', height: '34px', borderRadius: '10px', background: 'var(--yellow)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Plus size={13} color="#080c14" /></button>
          </div>
        </div>
        <button onClick={() => { addToCart(selected, qty); setQty(1); setScreen('food'); }}
          style={{ width: '100%', padding: '14px', background: 'var(--yellow)', border: 'none', borderRadius: '14px', fontWeight: 800, fontSize: '15px', color: '#080c14', cursor: 'pointer', fontFamily: 'Space Grotesk, sans-serif' }}>
          🛒 Add to Cart — {(selected.price * qty).toLocaleString()} RWF
        </button>
      </div>
    </div>
  );

  // ── PHARMACY SCREEN ───────────────────────────────────────────────────────
  if (screen === 'pharmacy') return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', paddingBottom: '100px' }}>
      <Header title="💊 Pharmacy" back={() => setScreen('home')} />

      {/* Discreet banner */}
      <div style={{ margin: '12px 14px 0', padding: '10px 14px', background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.2)', borderRadius: '10px', display: 'flex', alignItems: 'center', gap: '10px' }}>
        <span style={{ fontSize: '18px' }}>🔒</span>
        <p style={{ fontSize: '11px', color: 'rgba(139,92,246,0.9)', fontWeight: 600, lineHeight: 1.5 }}>All orders are <strong>100% discreet</strong>. Plain packaging, no labels. Delivered by motari only to you.</p>
      </div>

      {/* Sub-tabs */}
      <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', padding: '12px 14px 4px', scrollbarWidth: 'none' }}>
        {PHARM_TABS.map(t => (
          <button key={t.id} onClick={() => setPharmTab(t.id)}
            style={{ flexShrink: 0, padding: '7px 14px', borderRadius: '20px', border: `1px solid ${pharmTab === t.id ? 'var(--yellow)' : 'var(--border)'}`, background: pharmTab === t.id ? 'var(--yellow)' : 'var(--card)', cursor: 'pointer', fontFamily: 'Space Grotesk, sans-serif', fontWeight: 700, fontSize: '11px', color: pharmTab === t.id ? '#080c14' : 'var(--text3)', whiteSpace: 'nowrap' }}>
            {t.label}
          </button>
        ))}
      </div>

      <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {filteredPharm.map(item => {
          const inCart = cart.find(c => c.id === item.id);
          return (
            <div key={item.id} style={{ background: 'var(--card)', borderRadius: '14px', border: `1px solid ${item.sensitive ? 'rgba(139,92,246,0.2)' : 'var(--border)'}`, overflow: 'hidden' }}>
              <div style={{ display: 'flex', gap: '12px', padding: '14px' }}>
                <div style={{ width: '70px', height: '70px', borderRadius: '10px', overflow: 'hidden', flexShrink: 0, background: 'var(--bg3)' }}>
                  <img src={item.image_url} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    onError={e => { (e.target as HTMLImageElement).src = 'https://images.unsplash.com/photo-1550572017-edd951b55104?w=400'; }} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px', marginBottom: '4px' }}>
                    <div style={{ flex: 1 }}>
                      {item.sensitive && <span style={{ fontSize: '9px', fontWeight: 700, color: '#8b5cf6', background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.2)', borderRadius: '6px', padding: '2px 6px', display: 'inline-block', marginBottom: '4px' }}>🔒 Discreet</span>}
                      <p style={{ fontWeight: 700, fontSize: '13px', color: 'var(--text)', lineHeight: 1.3 }}>{item.name}</p>
                      <p style={{ fontSize: '10px', color: 'var(--text3)', marginTop: '2px' }}>{item.pack}</p>
                    </div>
                    <p style={{ fontWeight: 800, fontSize: '14px', color: 'var(--yellow)', whiteSpace: 'nowrap' }}>{item.price.toLocaleString()} RWF</p>
                  </div>
                  <p style={{ fontSize: '11px', color: 'var(--text3)', lineHeight: 1.5, marginBottom: '8px' }}>{item.description}</p>
                  <div style={{ background: 'rgba(245,197,24,0.06)', border: '1px solid rgba(245,197,24,0.15)', borderRadius: '8px', padding: '6px 10px', marginBottom: '10px' }}>
                    <p style={{ fontSize: '10px', fontWeight: 700, color: 'var(--yellow)', marginBottom: '2px' }}>💊 How to use</p>
                    <p style={{ fontSize: '10px', color: 'var(--text3)', lineHeight: 1.5 }}>{item.usage}</p>
                  </div>
                  <button onClick={() => addToCart(item)}
                    style={{ width: '100%', padding: '9px', background: inCart ? 'rgba(34,197,94,0.1)' : 'rgba(245,197,24,0.1)', border: `1px solid ${inCart ? 'rgba(34,197,94,0.3)' : 'rgba(245,197,24,0.3)'}`, borderRadius: '10px', cursor: 'pointer', fontFamily: 'Space Grotesk, sans-serif', fontWeight: 800, fontSize: '12px', color: inCart ? 'var(--green)' : 'var(--yellow)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                    {inCart ? <><Check size={13} /> Added ({inCart.qty})</> : <><Plus size={13} /> Add to Cart</>}
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  // ── SHOP SCREEN (drinks) ──────────────────────────────────────────────────
  if (screen === 'shop') return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', paddingBottom: '100px' }}>
      <Header title="🛍️ Shop — Drinks" back={() => setScreen('home')} />

      {/* Sub-tabs */}
      <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', padding: '12px 14px 4px', scrollbarWidth: 'none' }}>
        {SHOP_TABS.map(t => (
          <button key={t.id} onClick={() => setShopTab(t.id)}
            style={{ flexShrink: 0, padding: '7px 14px', borderRadius: '20px', border: `1px solid ${shopTab === t.id ? 'var(--yellow)' : 'var(--border)'}`, background: shopTab === t.id ? 'var(--yellow)' : 'var(--card)', cursor: 'pointer', fontFamily: 'Space Grotesk, sans-serif', fontWeight: 700, fontSize: '11px', color: shopTab === t.id ? '#080c14' : 'var(--text3)', whiteSpace: 'nowrap' }}>
            {t.label}
          </button>
        ))}
      </div>

      <div style={{ padding: '12px 14px', display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px' }}>
        {filteredShop.map(item => {
          const inCart = cart.find(c => c.id === item.id);
          return (
            <div key={item.id} style={{ background: 'var(--card)', borderRadius: '14px', border: '1px solid var(--border)', overflow: 'hidden' }}>
              <div style={{ position: 'relative' }}>
                <img src={item.image_url} alt={item.name} style={{ width: '100%', height: '110px', objectFit: 'cover' }}
                  onError={e => { (e.target as HTMLImageElement).src = 'https://images.unsplash.com/photo-1554866585-cd94860890b7?w=400'; }} />
                <span style={{ position: 'absolute', top: '6px', left: '6px', fontSize: '9px', fontWeight: 700, color: '#fff', background: item.subcategory === 'beer' ? 'rgba(245,158,11,0.85)' : item.subcategory === 'soda' ? 'rgba(59,130,246,0.85)' : 'rgba(34,197,94,0.85)', borderRadius: '6px', padding: '2px 7px' }}>
                  {item.subcategory === 'beer' ? '🍺 Beer' : item.subcategory === 'soda' ? '🥤 Soda' : '🍹 Soft'}
                </span>
              </div>
              <div style={{ padding: '10px' }}>
                <p style={{ fontWeight: 700, fontSize: '13px', color: 'var(--text)', marginBottom: '1px' }}>{item.name}</p>
                <p style={{ fontSize: '10px', color: 'var(--text3)', marginBottom: '6px' }}>{item.volume} · {item.brand}</p>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <p style={{ fontWeight: 800, fontSize: '13px', color: 'var(--yellow)' }}>{item.price.toLocaleString()} RWF</p>
                  <button onClick={() => addToCart(item)}
                    style={{ width: '30px', height: '30px', borderRadius: '8px', background: inCart ? 'var(--green)' : 'var(--yellow)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {inCart ? <Check size={13} color="#fff" /> : <Plus size={13} color="#080c14" />}
                  </button>
                </div>
                {inCart && <p style={{ fontSize: '10px', color: 'var(--green)', fontWeight: 700, marginTop: '4px' }}>✓ {inCart.qty} in cart</p>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  // ── FOOD SCREEN ───────────────────────────────────────────────────────────
  if (screen === 'food') return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', paddingBottom: '80px' }}>
      <div style={{ background: 'var(--bg2)', padding: '14px 16px 0', borderBottom: '1px solid var(--border)', position: 'sticky', top: 0, zIndex: 100 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button onClick={() => setScreen('home')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', display: 'flex' }}><ChevronLeft size={22} /></button>
            <div>
              <h2 style={{ fontFamily: 'Space Grotesk, sans-serif', fontSize: '17px', fontWeight: 800, color: 'var(--text)', margin: 0 }}>🍔 Order Food</h2>
              <p style={{ fontSize: '11px', color: 'var(--text3)', margin: 0 }}>Fast delivery in Kigali</p>
            </div>
          </div>
          <button onClick={() => setScreen('cart')} style={{ background: cartCount > 0 ? 'var(--yellow)' : 'var(--card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '7px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontFamily: 'Space Grotesk, sans-serif', fontWeight: 800, fontSize: '13px', color: cartCount > 0 ? '#080c14' : 'var(--text)' }}>
            <ShoppingCart size={15} />{cartCount > 0 && <span>{cartCount}</span>}
          </button>
        </div>
        <div style={{ position: 'relative', marginBottom: '10px' }}>
          <Search size={13} style={{ position: 'absolute', left: '11px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text3)' }} />
          <input placeholder="Search food…" value={search} onChange={e => setSearch(e.target.value)}
            style={{ width: '100%', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: '12px', padding: '9px 12px 9px 32px', fontSize: '13px', color: 'var(--text)', fontFamily: 'Space Grotesk, sans-serif', outline: 'none', boxSizing: 'border-box' }} />
          {search && <button onClick={() => setSearch('')} style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', display: 'flex' }}><X size={13} /></button>}
        </div>
        <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '10px', scrollbarWidth: 'none' }}>
          {FOOD_CATEGORIES.map(c => (
            <button key={c.id} onClick={() => setFoodCat(c.id)}
              style={{ flexShrink: 0, padding: '6px 13px', borderRadius: '20px', border: `1px solid ${foodCat === c.id ? 'var(--yellow)' : 'var(--border)'}`, background: foodCat === c.id ? 'var(--yellow)' : 'var(--card)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px', fontFamily: 'Space Grotesk, sans-serif', fontWeight: 700, fontSize: '11px', color: foodCat === c.id ? '#080c14' : 'var(--text3)' }}>
              <span>{c.emoji}</span><span>{c.label}</span>
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: '6px', paddingBottom: '10px', overflowX: 'auto', scrollbarWidth: 'none' }}>
          {([{ id: 'all', label: 'All' }, { id: 'popular', label: '⭐ Popular' }, { id: 'fast', label: '⚡ Fast ≤15m' }, { id: 'cheap', label: '💰 ≤2000 RWF' }] as { id: FilterType; label: string }[]).map(f => (
            <button key={f.id} onClick={() => setFilter(f.id)}
              style={{ flexShrink: 0, padding: '5px 11px', borderRadius: '16px', border: `1px solid ${filter === f.id ? 'rgba(245,197,24,0.5)' : 'var(--border)'}`, background: filter === f.id ? 'rgba(245,197,24,0.1)' : 'transparent', cursor: 'pointer', fontFamily: 'Space Grotesk, sans-serif', fontWeight: 600, fontSize: '11px', color: filter === f.id ? 'var(--yellow)' : 'var(--text3)' }}>
              {f.label}
            </button>
          ))}
        </div>
      </div>
      <div style={{ padding: '14px' }}>
        {filteredFoods.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px 24px' }}>
            <p style={{ fontSize: '40px', marginBottom: '12px' }}>🔍</p>
            <p style={{ fontWeight: 700, color: 'var(--text)', marginBottom: '6px' }}>No food found</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px' }}>
            {filteredFoods.map(food => {
              const inCart = cart.find(c => c.id === food.id);
              const isCombo = food.category === 'combo';
              return (
                <div key={food.id} onClick={() => { setSelected(food); setQty(1); setScreen('detail'); }}
                  style={{ background: 'var(--card)', borderRadius: '16px', overflow: 'hidden', border: `1px solid ${isCombo ? 'rgba(245,197,24,0.3)' : 'var(--border)'}`, cursor: 'pointer' }}>
                  <div style={{ position: 'relative' }}>
                    <img src={food.image_url} alt={food.name} style={{ width: '100%', height: '110px', objectFit: 'cover' }} />
                    {isCombo && <span style={{ position: 'absolute', top: '6px', left: '6px', fontSize: '9px', fontWeight: 700, color: '#080c14', background: '#f5c518', borderRadius: '6px', padding: '2px 7px' }}>🍱 COMBO</span>}
                    <div style={{ position: 'absolute', top: '6px', right: '6px', background: 'rgba(0,0,0,0.55)', borderRadius: '8px', padding: '3px 7px', display: 'flex', alignItems: 'center', gap: '3px' }}>
                      <Clock size={9} color="#fff" /><span style={{ fontSize: '10px', fontWeight: 700, color: '#fff' }}>{food.estimated_minutes}m</span>
                    </div>
                    {!isCombo && <div style={{ position: 'absolute', top: '6px', left: '6px', background: 'rgba(0,0,0,0.55)', borderRadius: '8px', padding: '3px 7px', display: 'flex', alignItems: 'center', gap: '3px' }}>
                      <Star size={9} color="#f5c518" fill="#f5c518" /><span style={{ fontSize: '10px', fontWeight: 700, color: '#fff' }}>{food.rating}</span>
                    </div>}
                  </div>
                  <div style={{ padding: '10px' }}>
                    <p style={{ fontWeight: 700, fontSize: '12px', color: 'var(--text)', marginBottom: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{food.name}</p>
                    <p style={{ fontSize: '10px', color: 'var(--text3)', marginBottom: '6px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{food.restaurant_name}</p>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <p style={{ fontWeight: 800, fontSize: '12px', color: 'var(--yellow)' }}>{food.price.toLocaleString()} RWF</p>
                      <button onClick={e => { e.stopPropagation(); addToCart(food); }}
                        style={{ width: '28px', height: '28px', borderRadius: '8px', background: inCart ? 'var(--green)' : 'var(--yellow)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {inCart ? <Check size={13} color="#fff" /> : <Plus size={13} color="#080c14" />}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );

  // ── HOME SCREEN ───────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', paddingBottom: '80px' }}>
      {/* Header */}
      <div style={{ background: 'var(--bg2)', padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button onClick={() => { setScreen('home'); setCart([]); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', display: 'flex' }}><ChevronLeft size={22} /></button>
          <div>
            <h2 style={{ fontFamily: 'Space Grotesk, sans-serif', fontSize: '18px', fontWeight: 800, color: 'var(--text)', margin: 0 }}>Easy GO Shop</h2>
            <p style={{ fontSize: '11px', color: 'var(--text3)', margin: 0 }}>Kigali delivery 🇷🇼</p>
          </div>
        </div>
        <button onClick={() => setScreen('cart')} style={{ background: cartCount > 0 ? 'var(--yellow)' : 'var(--card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '7px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontFamily: 'Space Grotesk, sans-serif', fontWeight: 800, fontSize: '13px', color: cartCount > 0 ? '#080c14' : 'var(--text)' }}>
          <ShoppingCart size={15} />{cartCount > 0 && <span>{cartCount}</span>}
        </button>
      </div>

      <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '14px' }}>

        {/* Hero cards */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
          {[
            { screen: 'food' as Screen,     emoji: '🍔', label: 'Food',     sub: 'Combos & meals',      bg: 'linear-gradient(135deg,#f59e0b22,#f5c51822)', border: 'rgba(245,197,24,0.3)',  color: 'var(--yellow)' },
            { screen: 'shop' as Screen,     emoji: '🍺', label: 'Drinks',   sub: 'Beer, soda, juice',   bg: 'linear-gradient(135deg,#3b82f622,#60a5fa22)', border: 'rgba(59,130,246,0.3)', color: '#60a5fa' },
            { screen: 'pharmacy' as Screen, emoji: '💊', label: 'Pharmacy', sub: 'Discreet delivery',   bg: 'linear-gradient(135deg,#8b5cf622,#a78bfa22)', border: 'rgba(139,92,246,0.3)', color: '#a78bfa' },
          ].map(c => (
            <div key={c.screen} onClick={() => setScreen(c.screen)}
              style={{ background: c.bg, border: `1px solid ${c.border}`, borderRadius: '16px', padding: '16px 10px', textAlign: 'center', cursor: 'pointer', transition: 'transform .15s' }}
              onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.03)')}
              onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}>
              <p style={{ fontSize: '30px', marginBottom: '6px' }}>{c.emoji}</p>
              <p style={{ fontWeight: 800, fontSize: '13px', color: c.color, marginBottom: '2px' }}>{c.label}</p>
              <p style={{ fontSize: '10px', color: 'var(--text3)', lineHeight: 1.3 }}>{c.sub}</p>
            </div>
          ))}
        </div>

        {/* Combo spotlight */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <p style={{ fontWeight: 800, fontSize: '15px', color: 'var(--text)' }}>🍱 Combo Deals</p>
            <button onClick={() => { setFoodCat('combo'); setScreen('food'); }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '12px', color: 'var(--yellow)', fontWeight: 700, fontFamily: 'Space Grotesk, sans-serif' }}>See all →</button>
          </div>
          <div style={{ display: 'flex', gap: '10px', overflowX: 'auto', scrollbarWidth: 'none', paddingBottom: '4px' }}>
            {DEMO_FOODS.filter(f => f.category === 'combo').slice(0, 5).map(food => (
              <div key={food.id} onClick={() => { setSelected(food); setQty(1); setScreen('detail'); }}
                style={{ flexShrink: 0, width: '155px', background: 'var(--card)', borderRadius: '14px', overflow: 'hidden', border: '1px solid rgba(245,197,24,0.25)', cursor: 'pointer' }}>
                <img src={food.image_url} alt={food.name} style={{ width: '100%', height: '90px', objectFit: 'cover' }} />
                <div style={{ padding: '8px 10px' }}>
                  <p style={{ fontWeight: 700, fontSize: '12px', color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: '2px' }}>{food.name}</p>
                  <p style={{ fontWeight: 800, fontSize: '12px', color: 'var(--yellow)' }}>{food.price.toLocaleString()} RWF</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Drinks spotlight */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <p style={{ fontWeight: 800, fontSize: '15px', color: 'var(--text)' }}>🍺 Cold Drinks</p>
            <button onClick={() => setScreen('shop')} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '12px', color: '#60a5fa', fontWeight: 700, fontFamily: 'Space Grotesk, sans-serif' }}>See all →</button>
          </div>
          <div style={{ display: 'flex', gap: '10px', overflowX: 'auto', scrollbarWidth: 'none', paddingBottom: '4px' }}>
            {SHOP_ITEMS.slice(0, 6).map(item => (
              <div key={item.id} style={{ flexShrink: 0, width: '120px', background: 'var(--card)', borderRadius: '14px', overflow: 'hidden', border: '1px solid var(--border)' }}>
                <img src={item.image_url} alt={item.name} style={{ width: '100%', height: '80px', objectFit: 'cover' }}
                  onError={e => { (e.target as HTMLImageElement).src = 'https://images.unsplash.com/photo-1554866585-cd94860890b7?w=400'; }} />
                <div style={{ padding: '8px' }}>
                  <p style={{ fontWeight: 700, fontSize: '11px', color: 'var(--text)', marginBottom: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</p>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <p style={{ fontWeight: 800, fontSize: '11px', color: 'var(--yellow)' }}>{item.price.toLocaleString()}</p>
                    <button onClick={() => addToCart(item)} style={{ width: '22px', height: '22px', borderRadius: '6px', background: 'var(--yellow)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Plus size={11} color="#080c14" /></button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Pharmacy spotlight */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
            <p style={{ fontWeight: 800, fontSize: '15px', color: 'var(--text)' }}>💊 Pharmacy</p>
            <button onClick={() => setScreen('pharmacy')} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '12px', color: '#a78bfa', fontWeight: 700, fontFamily: 'Space Grotesk, sans-serif' }}>See all →</button>
          </div>
          <div style={{ padding: '10px 12px', background: 'rgba(139,92,246,0.06)', border: '1px solid rgba(139,92,246,0.15)', borderRadius: '10px', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '16px' }}>🔒</span>
            <p style={{ fontSize: '11px', color: 'rgba(139,92,246,0.8)', fontWeight: 600 }}>Discreet delivery — plain packaging, no labels</p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            {PHARM_ITEMS.slice(0, 4).map(item => (
              <div key={item.id} style={{ background: 'var(--card)', borderRadius: '12px', border: '1px solid var(--border)', padding: '12px' }}>
                <p style={{ fontWeight: 700, fontSize: '12px', color: 'var(--text)', marginBottom: '2px', lineHeight: 1.3 }}>{item.name}</p>
                <p style={{ fontSize: '10px', color: 'var(--text3)', marginBottom: '8px' }}>{item.pack}</p>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <p style={{ fontWeight: 800, fontSize: '12px', color: 'var(--yellow)' }}>{item.price.toLocaleString()} RWF</p>
                  <button onClick={() => addToCart(item)} style={{ width: '26px', height: '26px', borderRadius: '7px', background: 'rgba(139,92,246,0.15)', border: '1px solid rgba(139,92,246,0.25)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Plus size={12} color="#a78bfa" /></button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
