'use strict';
// Built-in clues, written for this game (not taken from any TV show).
//
// A category is [name, [clue, response] x 5], easiest first: the five rows of the board. Clues
// are statements; the host reads them out and the player answers "What is…" / "Who is…".
// Responses are the bare answer; the host decides whether what they heard matches.
//
// A game needs 12 categories and one Final clue. The "no repeats" rule means a category does
// not come back until every other category in the packs you have on has been played.

const GENERAL = [
  ['U.S. STATES', ['The only state whose name ends in three vowels in a row', 'Hawaii'], ['The Grand Canyon State', 'Arizona'], ['Its capital is Baton Rouge', 'Louisiana'], ['The only state that borders just one other state', 'Maine'], ['The state with the most land area after Alaska', 'Texas']],
  ['ANIMAL KINGDOM', ['The tallest animal on Earth', 'Giraffe'], ['A group of lions', 'A pride'], ['This flightless bird lays the largest egg of any living animal', 'Ostrich'], ['The only mammal that can truly fly', 'Bat'], ['This animal has the slowest metabolism of any mammal, moving a few feet a minute', 'Sloth']],
  ['THE HUMAN BODY', ['The largest organ of the human body', 'Skin'], ['The number of chambers in a human heart', 'Four'], ['This bone in the thigh is the longest in the body', 'Femur'], ['The windpipe, by its medical name', 'Trachea'], ['The smallest bone in the body, found in the ear', 'Stapes (stirrup)']],
  ['COLORS', ['Mixing blue and yellow paint gives you this color', 'Green'], ['The color of a stop sign', 'Red'], ['On a traffic light, this color is on top', 'Red'], ['Ripe bananas are this color; unripe ones are green', 'Yellow'], ['The three primary colors of light: red, green and this', 'Blue']],
  ['COUNTING', ['The number of days in a leap year', '366'], ['The number of cards in a standard deck, not counting jokers', '52'], ['The number of players on a soccer team on the field', '11'], ['The number of keys on a full-size piano', '88'], ['The number of bones in an adult human body', '206']],
  ['FAMOUS LANDMARKS', ['This Paris tower opened in 1889 and is named for its engineer', 'The Eiffel Tower'], ['Lady Liberty stands in this U.S. city\'s harbor', 'New York'], ['The Colosseum is in this Italian capital', 'Rome'], ['Machu Picchu is a 15th-century Inca city in this country', 'Peru'], ['The Great Wall was built mainly to protect this country\'s northern border', 'China']],
  ['HOLIDAYS', ['Pumpkins get carved for this October holiday', 'Halloween'], ['Fireworks light up the sky on this date for U.S. Independence Day', 'July 4th'], ['Hearts and chocolates are exchanged on this February holiday', 'Valentine\'s Day'], ['This holiday honors fallen U.S. service members on the last Monday in May', 'Memorial Day'], ['Known for its lanterns and red envelopes, this holiday starts a new year on the lunar calendar', 'Lunar New Year (Chinese New Year)']],
  ['KITCHEN TOOLS', ['You flip pancakes with this flat tool', 'A spatula'], ['This tool drains pasta', 'A colander (strainer)'], ['A hand tool with a crank that makes a can\'s lid come off', 'A can opener'], ['This tool turns a block of cheese into shreds', 'A grater'], ['A chef\'s knife is sharpened on this long steel rod', 'A honing steel (sharpening steel)']],
  ['ROAD TRIP', ['The number of wheels on a tricycle', 'Three'], ['A red octagon sign tells you to do this', 'Stop'], ['This pedal is on the far left in a car with a manual transmission', 'The clutch'], ['The longest U.S. Interstate, I-90, runs from Seattle to this East Coast city', 'Boston'], ['Route 66 ran from Chicago to this California city', 'Santa Monica (Los Angeles)']],
  ['TOOLS OF THE TRADE', ['You hit nails with this', 'A hammer'], ['A carpenter\'s level has a bubble floating in this', 'Liquid (alcohol or oil)'], ['A Phillips screwdriver fits a screw with this shape in its head', 'A cross (plus sign)'], ['This tool measures the diameter of a bolt or the thickness of a part to a fraction of a millimeter', 'Calipers'], ['A tape measure, a square and a chalk line are all used by this tradesperson who builds the frame of a house', 'A carpenter (framer)']],
  ['BOARD GAMES', ['The property game where you can go to jail', 'Monopoly'], ['Colonel Mustard and Miss Scarlet are suspects in this game', 'Clue'], ['Triple-word scores are found in this word game', 'Scrabble'], ['In chess, this piece can only move diagonally', 'The bishop'], ['In this game, you build settlements and trade wood, brick, wool, grain and ore', 'Catan (Settlers of Catan)']],
  ['IN THE GARAGE', ['Turning this wrench clockwise usually tightens a bolt', 'A socket wrench (ratchet)'], ['You check this fluid with a dipstick', 'Oil'], ['A flat tire gets changed with the help of this lifting tool', 'A jack'], ['The device that sends a spark into a car engine\'s cylinder', 'A spark plug'], ['This fluid in a car stops the engine from overheating', 'Coolant (antifreeze)']],
  ['OCEANS & SEAS', ['The largest ocean on Earth', 'The Pacific'], ['This sea separates Europe from Africa', 'The Mediterranean'], ['The ocean that touches the east coast of the United States', 'The Atlantic'], ['The Red Sea separates Egypt from this country\'s western coast', 'Saudi Arabia'], ['The deepest known point in the ocean, in the Pacific', 'The Mariana Trench (Challenger Deep)']],
  ['THE CALENDAR', ['The month with the fewest days', 'February'], ['The day of the week named for the Norse god Thor', 'Thursday'], ['The number of months with 31 days', 'Seven'], ['This month is named for Julius Caesar', 'July'], ['The number of weeks in a year', '52']],
  ['WEATHER', ['Water that falls from clouds as frozen flakes', 'Snow'], ['A spinning column of air that reaches from a storm cloud to the ground', 'A tornado'], ['The instrument that measures air pressure', 'A barometer'], ['A hurricane in the western Pacific goes by this name', 'A typhoon'], ['The center of a hurricane, where the winds are calm', 'The eye']],
  ['MONEY TALK', ['The U.S. coin worth 25 cents', 'A quarter'], ['The currency of Japan', 'The yen'], ['The dead president on the U.S. $100 bill is not a president at all; it\'s this man', 'Benjamin Franklin'], ['The currency shared by most of the European Union', 'The euro'], ['The paper money of the United States is printed by this government bureau', 'The Bureau of Engraving and Printing']],
  ['STUFF IN SPACE', ['The planet closest to the Sun', 'Mercury'], ['Earth\'s only natural satellite', 'The Moon'], ['The planet with the famous rings', 'Saturn'], ['The galaxy that contains our solar system', 'The Milky Way'], ['The largest moon in the solar system, orbiting Jupiter', 'Ganymede']]
];

const SPORTS = [
  ['BASEBALL', ['The number of strikes that make an out', 'Three'], ['The number of innings in a regulation game', 'Nine'], ['This team has won the most World Series titles', 'The New York Yankees'], ['The nickname of Babe Ruth, "The Sultan of…"', 'Swat'], ['This player broke the color barrier with the Brooklyn Dodgers in 1947', 'Jackie Robinson']],
  ['FOOTBALL', ['Points for a touchdown, before the extra point', 'Six'], ['The NFL championship game', 'The Super Bowl'], ['The number of players on the field per team', '11'], ['The team with the most Super Bowl wins, tied at six with the Steelers', 'The New England Patriots'], ['This quarterback won seven Super Bowls', 'Tom Brady']],
  ['BASKETBALL', ['A basket from beyond the arc is worth this many points', 'Three'], ['The number of players per team on the court', 'Five'], ['This Chicago Bulls legend wore number 23', 'Michael Jordan'], ['The height of an NBA hoop, in feet', 'Ten'], ['This team won its record 18th NBA championship in 2024', 'The Boston Celtics']],
  ['SOCCER', ['The soccer match that decides a tie after extra time', 'A penalty shootout'], ['This country has won the most World Cups', 'Brazil'], ['A player who scores three goals in one game has scored this', 'A hat trick'], ['The only player on the field allowed to use their hands', 'The goalkeeper'], ['Lionel Messi finally won the World Cup with Argentina in this year', '2022']],
  ['THE OLYMPICS', ['The number of rings on the Olympic flag', 'Five'], ['This swimmer holds the record for the most Olympic gold medals', 'Michael Phelps'], ['The Olympic Games are held every this many years', 'Four'], ['The city that hosted the 2024 Summer Olympics', 'Paris'], ['The ancient Olympics were held in this country', 'Greece']],
  ['GOLF', ['A score of one under par on a hole', 'A birdie'], ['The green jacket is awarded at this tournament', 'The Masters'], ['A hole in one on a par three is this many under par', 'Two (an eagle)'], ['This golfer has won 15 major championships', 'Tiger Woods'], ['The word shouted to warn people a ball is heading their way', 'Fore']],
  ['HOCKEY', ['The disc players hit instead of a ball', 'The puck'], ['The NHL championship trophy', 'The Stanley Cup'], ['The number of periods in a hockey game', 'Three'], ['Players sit in this area as a penalty', 'The penalty box'], ['Known as "The Great One," he holds the NHL points record', 'Wayne Gretzky']],
  ['RACING', ['The Indianapolis 500 is this many miles long', '500'], ['The most famous NASCAR race, run each February in Florida', 'The Daytona 500'], ['The letters "F1" stand for this', 'Formula One'], ['The Monaco Grand Prix is run on these, not a purpose-built track', 'City streets'], ['Winning the Monaco Grand Prix, the Indy 500 and the 24 Hours of Le Mans is called this crown', 'The Triple Crown of Motorsport']],
  ['TENNIS', ['A score of zero in tennis', 'Love'], ['The Grand Slam tournament played on grass', 'Wimbledon'], ['This player has won the most men\'s Grand Slam singles titles, 24', 'Novak Djokovic'], ['Serena Williams won this many Grand Slam singles titles', '23'], ['A serve the receiver cannot touch', 'An ace']]
];

const SCREEN = [
  ['ANIMATED MOVIES', ['Lightning McQueen races in this Pixar film', 'Cars'], ['Simba grows up to be the king in this 1994 film', 'The Lion King'], ['Elsa sings "Let It Go" in this film', 'Frozen'], ['A rat named Remy cooks in Paris in this film', 'Ratatouille'], ['The first full-length computer-animated feature film, from 1995', 'Toy Story']],
  ['SUPERHEROES', ['This hero\'s alter ego is Bruce Wayne', 'Batman'], ['Peter Parker is bitten by a radioactive one of these', 'A spider'], ['Thor\'s hammer', 'Mjolnir'], ['Tony Stark\'s armored alter ego', 'Iron Man'], ['This hero\'s home planet is Krypton', 'Superman']],
  ['SITCOMS', ['Monica, Chandler, Ross, Rachel, Joey and Phoebe', 'Friends'], ['Michael Scott manages a paper company in Scranton on this show', 'The Office'], ['Jerry, George, Elaine and Kramer', 'Seinfeld'], ['Leslie Knope works in the parks department of Pawnee, Indiana on this show', 'Parks and Recreation'], ['The Belcher family runs a burger joint on this animated show', 'Bob\'s Burgers']],
  ['MOVIE QUOTES', ['"I\'ll be back" was first said by Arnold Schwarzenegger in this 1984 film', 'The Terminator'], ['"May the Force be with you"', 'Star Wars'], ['"You can\'t handle the truth!" is shouted in this courtroom film', 'A Few Good Men'], ['"I\'m the king of the world!" is yelled from the bow of this ship', 'Titanic'], ['"Here\'s looking at you, kid" is said in this 1942 film', 'Casablanca']],
  ['BANDS', ['John, Paul, George and Ringo', 'The Beatles'], ['Freddie Mercury fronted this band', 'Queen'], ['"Sweet Child O\' Mine" is by this band', 'Guns N\' Roses'], ['Dave Grohl founded this band after Nirvana', 'Foo Fighters'], ['This Irish band\'s singer goes by Bono', 'U2']],
  ['90s MOVIES', ['Dinosaurs are brought back to life in this 1993 film', 'Jurassic Park'], ['Jack and Rose fall in love on a doomed ship', 'Titanic'], ['Tom Hanks sits on a bench with a box of chocolates in this film', 'Forrest Gump'], ['Keanu Reeves takes the red pill in this 1999 film', 'The Matrix'], ['A kid named Kevin defends his house from two burglars', 'Home Alone']],
  ['TV GAME SHOWS', ['Contestants spin a big wheel and buy vowels', 'Wheel of Fortune'], ['Contestants guess prices of items and spin a wheel to reach the Showcase', 'The Price Is Right'], ['Survey says! Families guess the most popular answers', 'Family Feud'], ['Contestants are voted off an island on this reality competition', 'Survivor'], ['Drew Carey hosts The Price Is Right; this man hosted it for 35 years before him', 'Bob Barker']],
  ['POP SINGERS', ['She released the albums "1989" and "Folklore"', 'Taylor Swift'], ['"Shape of You" and "Perfect" are by this English singer', 'Ed Sheeran'], ['The Queen of Pop, known for "Like a Virgin"', 'Madonna'], ['This singer\'s albums include "21" and "25"', 'Adele'], ['Before going solo, Harry Styles was in this boy band', 'One Direction']],
  ['STAR WARS', ['Luke Skywalker\'s father', 'Darth Vader (Anakin Skywalker)'], ['Han Solo\'s ship', 'The Millennium Falcon'], ['This small green Jedi master trains Luke on Dagobah', 'Yoda'], ['Chewbacca belongs to this species', 'Wookiee'], ['The planet-destroying space station in the first film', 'The Death Star']],
  ['STREAMING HITS', ['Eleven and the Upside Down are part of this Netflix show', 'Stranger Things'], ['Players compete in deadly children\'s games in this Korean series', 'Squid Game'], ['Baby Yoda, officially Grogu, appears in this Star Wars series', 'The Mandalorian'], ['Ted Lasso coaches soccer in England on this Apple TV+ show', 'Ted Lasso'], ['The Roy family fights over a media empire in this HBO series', 'Succession']]
];

const FOOD = [
  ['PIZZA', ['The most popular pizza topping in the U.S.', 'Pepperoni'], ['This Italian city is the birthplace of pizza', 'Naples'], ['A pizza with tomato, mozzarella and basil, named for a queen', 'Margherita'], ['Deep-dish pizza is a specialty of this U.S. city', 'Chicago'], ['This style of pizza from Detroit is baked in a rectangular pan with cheese pushed to the edges', 'Detroit-style']],
  ['FRUIT', ['The fruit that keeps the doctor away', 'An apple'], ['This yellow fruit comes in a bunch', 'Bananas'], ['The fruit that is squeezed to make Florida\'s famous juice', 'Oranges'], ['This big green-striped fruit is red inside with black seeds', 'Watermelon'], ['Botanically, this yellow fruit is a berry, while the strawberry is not', 'A banana']],
  ['FAST FOOD', ['The Big Mac is sold by this chain', 'McDonald\'s'], ['This chain is famous for the Whopper', 'Burger King'], ['"Eat Fresh" is the slogan of this sandwich chain', 'Subway'], ['This chain is closed on Sundays', 'Chick-fil-A'], ['The Crunchwrap Supreme is sold here', 'Taco Bell']],
  ['COFFEE & TEA', ['The Seattle coffee chain with a green mermaid logo', 'Starbucks'], ['Espresso topped with steamed milk and foam', 'A cappuccino (or latte)'], ['This country drinks the most tea per person; it is not China', 'Turkey'], ['Coffee beans are the seeds of this fruit', 'A coffee cherry'], ['Finely ground coffee forced through with hot water under pressure makes this strong shot', 'Espresso']],
  ['BREAKFAST', ['A stack of these is served with maple syrup', 'Pancakes'], ['This breakfast meat is cut from the belly of a pig', 'Bacon'], ['Eggs cooked by whisking them in a pan', 'Scrambled'], ['This breakfast is made by soaking bread in egg and frying it', 'French toast'], ['Eggs Benedict is topped with this sauce made from egg yolks and butter', 'Hollandaise']],
  ['CANDY', ['Small chocolate candies that melt in your mouth, not in your hand', 'M&M\'s'], ['This candy bar is made of nougat, caramel and peanuts', 'Snickers'], ['Peanut butter cups are made by this company', 'Reese\'s'], ['These chewy fruit candies come in a rainbow', 'Skittles'], ['This Italian company makes Nutella, Kinder eggs and Tic Tacs', 'Ferrero']],
  ['WORLD CUISINE', ['Sushi comes from this country', 'Japan'], ['Tacos and enchiladas come from this country', 'Mexico'], ['Pad thai is a noodle dish from this country', 'Thailand'], ['Paella is a rice dish from this country', 'Spain'], ['Pho is a noodle soup from this country', 'Vietnam']],
  ['IN THE BAR', ['A margarita\'s main spirit', 'Tequila'], ['This beer is poured slowly and has a famous creamy head', 'Guinness'], ['A mojito is made with rum, lime, sugar, soda and this herb', 'Mint'], ['This whiskey must be made in the United States from at least 51% corn', 'Bourbon'], ['Gin, vermouth and an olive or a twist', 'A martini']]
];

const SCIENCE = [
  ['THE PERIODIC TABLE', ['The chemical symbol O stands for this element', 'Oxygen'], ['The element with atomic number 1', 'Hydrogen'], ['The chemical symbol Au stands for this precious metal', 'Gold'], ['This element is in every diamond and every pencil', 'Carbon'], ['The chemical symbol Fe stands for this metal', 'Iron']],
  ['DINOSAURS', ['The "king of the tyrant lizards"', 'Tyrannosaurus rex'], ['This three-horned dinosaur had a big frill', 'Triceratops'], ['The long-necked plant eaters like Brontosaurus belong to this group', 'Sauropods'], ['Most scientists think this event wiped out the dinosaurs 66 million years ago', 'An asteroid impact'], ['Birds are the living descendants of this group of dinosaurs that includes Velociraptor', 'Theropods']],
  ['SIMPLE MACHINES', ['A seesaw is an example of this simple machine', 'A lever'], ['A ramp is an example of this simple machine', 'An inclined plane'], ['A doorknob and a steering wheel are examples of this simple machine', 'A wheel and axle'], ['A flagpole uses this simple machine to raise the flag', 'A pulley'], ['An ax blade is an example of this simple machine', 'A wedge']],
  ['INVENTIONS', ['Thomas Edison is credited with this light source', 'The light bulb'], ['Alexander Graham Bell is credited with this device for talking at a distance', 'The telephone'], ['The Wright brothers built the first successful one of these', 'An airplane'], ['Johannes Gutenberg invented this in the 1400s, making books cheap', 'The printing press'], ['Tim Berners-Lee invented this in 1989', 'The World Wide Web']],
  ['THE SOLAR SYSTEM', ['The red planet', 'Mars'], ['The largest planet', 'Jupiter'], ['The number of planets in the solar system', 'Eight'], ['This planet spins on its side', 'Uranus'], ['The dwarf planet that lost its planet status in 2006', 'Pluto']],
  ['PHYSICS', ['The force that pulls objects toward Earth', 'Gravity'], ['The speed of light is about 186,000 of these per second', 'Miles'], ['E = mc² is this scientist\'s famous equation', 'Albert Einstein'], ['The unit of electrical resistance', 'The ohm'], ['The temperature at which all molecular motion stops', 'Absolute zero']],
  ['THE BODY\'S SYSTEMS', ['The heart is the pump of this system', 'The circulatory system'], ['The brain and the spinal cord make up the central part of this system', 'The nervous system'], ['Your lungs belong to this system', 'The respiratory system'], ['The stomach and intestines belong to this system', 'The digestive system'], ['The kidneys filter blood as part of this system', 'The urinary (excretory) system']],
  ['COMPUTERS', ['The "brain" of a computer, abbreviated CPU', 'Central processing unit'], ['A billion bytes', 'A gigabyte'], ['The operating system made by Microsoft', 'Windows'], ['This company makes the iPhone', 'Apple'], ['The programming language named after a British comedy troupe', 'Python']]
];

const HISTORY = [
  ['U.S. PRESIDENTS', ['The first president of the United States', 'George Washington'], ['This president gave the Gettysburg Address', 'Abraham Lincoln'], ['The president during most of World War II, elected four times', 'Franklin D. Roosevelt'], ['The youngest person ever elected president', 'John F. Kennedy'], ['The president who was a peanut farmer from Georgia', 'Jimmy Carter']],
  ['WORLD CAPITALS', ['The capital of France', 'Paris'], ['The capital of Japan', 'Tokyo'], ['The capital of Canada', 'Ottawa'], ['The capital of Australia', 'Canberra'], ['The capital of Brazil', 'Brasília']],
  ['ANCIENT WORLD', ['The pyramids of Giza are in this country', 'Egypt'], ['This city-state was the birthplace of democracy', 'Athens'], ['Julius Caesar ruled this empire', 'Rome'], ['The Trojan Horse was used to enter this city', 'Troy'], ['This Macedonian king conquered an empire from Greece to India by age 30', 'Alexander the Great']],
  ['THE 1960s', ['This president was assassinated in Dallas in 1963', 'John F. Kennedy'], ['In 1969 this man became the first person to walk on the Moon', 'Neil Armstrong'], ['Martin Luther King Jr. gave his "I Have a Dream" speech in this city in 1963', 'Washington, D.C.'], ['This 1969 music festival was held on a dairy farm in New York', 'Woodstock'], ['The Beatles first appeared on this TV host\'s show in 1964', 'Ed Sullivan']],
  ['WORLD WAR II', ['The war in Europe ended in this year', '1945'], ['The attack on this Hawaiian naval base brought the U.S. into the war', 'Pearl Harbor'], ['June 6, 1944, the Allied invasion of Normandy', 'D-Day'], ['This British prime minister led the country through the war', 'Winston Churchill'], ['The code name of the U.S. program that built the atomic bomb', 'The Manhattan Project']],
  ['EXPLORERS', ['He sailed the ocean blue in 1492', 'Christopher Columbus'], ['These two explorers led an expedition across the Louisiana Purchase to the Pacific', 'Lewis and Clark'], ['The first person to reach the South Pole, in 1911', 'Roald Amundsen'], ['The first expedition to sail around the world was led by this Portuguese explorer', 'Ferdinand Magellan'], ['Edmund Hillary and Tenzing Norgay were the first to reach the top of this', 'Mount Everest']],
  ['GEOGRAPHY', ['The longest river in the world', 'The Nile (or Amazon)'], ['The continent that is also a country', 'Australia'], ['The largest country by area', 'Russia'], ['The highest mountain in Africa', 'Kilimanjaro'], ['The smallest country in the world', 'Vatican City']],
  ['AMERICAN HISTORY', ['The Declaration of Independence was signed in this year', '1776'], ['The war between the North and the South', 'The Civil War'], ['The Boston Tea Party protested a tax on this', 'Tea'], ['The Louisiana Purchase was bought from this country', 'France'], ['This amendment gave women the right to vote in 1920', 'The 19th Amendment']]
];

const POP = [
  ['SOCIAL MEDIA', ['Short videos and dances made this app famous', 'TikTok'], ['This app\'s logo is a camera in a gradient square', 'Instagram'], ['Posts here used to be limited to 140 characters', 'Twitter (X)'], ['Mark Zuckerberg founded this network in a Harvard dorm', 'Facebook'], ['Messages disappear after viewing on this app with a ghost logo', 'Snapchat']],
  ['VIDEO GAMES', ['This plumber jumps on Goombas', 'Mario'], ['Build with blocks and survive the night in this game', 'Minecraft'], ['A battle royale where players drop from a bus and build walls', 'Fortnite'], ['This Nintendo franchise has you catching creatures like Pikachu', 'Pokémon'], ['Link is the hero of this Nintendo series, not Zelda', 'The Legend of Zelda']],
  ['BRAND LOGOS', ['A swoosh', 'Nike'], ['Golden arches', 'McDonald\'s'], ['A bitten apple', 'Apple'], ['A blue bird, until it became an X', 'Twitter'], ['A green mermaid', 'Starbucks']],
  ['CARS', ['The German brand with four rings in its logo', 'Audi'], ['The Mustang is made by this company', 'Ford'], ['Elon Musk\'s electric car company', 'Tesla'], ['The Corvette is made by this brand', 'Chevrolet'], ['This Italian brand uses a prancing horse logo', 'Ferrari']],
  ['INTERNET SLANG', ['LOL', 'Laughing out loud'], ['FOMO', 'Fear of missing out'], ['TBH', 'To be honest'], ['IYKYK', 'If you know, you know'], ['GOAT, as in an athlete', 'Greatest of all time']],
  ['CELEBRITY NICKNAMES', ['"The Rock"', 'Dwayne Johnson'], ['"Queen Bey"', 'Beyoncé'], ['"The King of Pop"', 'Michael Jackson'], ['"The Boss"', 'Bruce Springsteen'], ['"The Material Girl"', 'Madonna']],
  ['APPS & TECH', ['The app that gets you a ride with a stranger\'s car', 'Uber (or Lyft)'], ['The streaming service that started by mailing DVDs', 'Netflix'], ['This company\'s voice assistant is named Alexa', 'Amazon'], ['Swipe right to like someone on this dating app', 'Tinder'], ['This messaging app, owned by Meta, has more than two billion users', 'WhatsApp']]
];

const WORDS = [
  ['RHYME TIME', ['A cheerful father', 'A glad dad'], ['An overweight feline', 'A fat cat'], ['A large hog', 'A big pig'], ['An angry young man', 'A mad lad'], ['A tardy companion', 'A late mate']],
  ['OPPOSITES', ['The opposite of "hot"', 'Cold'], ['The opposite of "ancient"', 'Modern'], ['The opposite of "generous"', 'Stingy (selfish)'], ['The opposite of "transparent"', 'Opaque'], ['The opposite of "verbose"', 'Concise (terse)']],
  ['ANAGRAMS', ['Rearrange "LISTEN" to get this word for quiet', 'Silent'], ['Rearrange "EARTH" to get the organ that pumps blood', 'Heart'], ['Rearrange "DUSTY" to get this word for what students do', 'Study'], ['Rearrange "NIGHT" to get this body part', 'Thigh'], ['Rearrange "ELBOW" to get this word meaning under', 'Below']],
  ['PORTMANTEAUS', ['Breakfast plus lunch', 'Brunch'], ['Spoon plus fork', 'Spork'], ['Smoke plus fog', 'Smog'], ['Motor plus hotel', 'Motel'], ['Web plus log', 'Blog']],
  ['THREE-LETTER WORDS', ['Not wet', 'Dry'], ['A young dog', 'Pup'], ['A small, simple bed', 'Cot'], ['A fib', 'Lie'], ['A gratuity, or a helpful hint', 'Tip']],
  ['SPELLING BEE', ['The number of C\'s in "necessary"', 'One'], ['The number of S\'s in "Mississippi"', 'Four'], ['The silent letter in "knife"', 'K'], ['The double letters in "accommodate"', 'C and M'], ['The number of letters in the longest word in most English dictionaries, "pneumonoultramicroscopicsilicovolcanoconiosis"', '45']],
  ['PHRASES', ['"It\'s raining cats and…"', 'Dogs'], ['"The early bird catches the…"', 'Worm'], ['"Don\'t count your chickens before they…"', 'Hatch'], ['"A penny saved is a penny…"', 'Earned'], ['"The squeaky wheel gets the…"', 'Grease']]
];

const LATE = [
  ['DRINKING GAMES', ['Ping-pong balls, red cups, and a table', 'Beer pong'], ['In this game you drink (or put a finger down) if you have done what someone says they have never done', 'Never Have I Ever'], ['In this card game, drawing a king means you pour into the center cup', 'Kings (King\'s Cup)'], ['A game where you turn a cup upside down with your fingertip after chugging', 'Flip cup'], ['This game is played with a quarter bounced into a glass', 'Quarters']],
  ['HANGOVER CURES', ['The classic morning-after drink with tomato juice and vodka', 'A Bloody Mary'], ['The pain reliever you should avoid with alcohol because of your liver', 'Acetaminophen (Tylenol)'], ['The electrolyte drink athletes use that is also a hangover favorite', 'Gatorade (or Pedialyte)'], ['Drinking more alcohol the morning after, named for part of the animal that bit you', 'Hair of the dog'], ['The true cure for a hangover, which nobody wants to hear', 'Time (and water)']],
  ['DATING', ['Swiping right means this', 'You like them'], ['Disappearing on someone without a word', 'Ghosting'], ['A date set up by friends, where the two people have never met', 'A blind date'], ['Dating someone much younger than you makes you this animal', 'A cougar'], ['Keeping someone around as a backup while dating others', 'Benching (breadcrumbing)']],
  ['BAD DECISIONS', ['A tattoo of this person\'s name is the classic regret', 'An ex'], ['Texting an ex after midnight is usually caused by this', 'Alcohol'], ['The casino game where the house always wins because of the green pockets', 'Roulette'], ['Buying a round for the whole bar usually happens on this kind of night', 'Payday'], ['A quick wedding in this city can be undone later, but not easily', 'Las Vegas']]
];

/* ----------------------------------------------------------------- finals */
// Final clues: harder, one per game. [category, clue, response].
const FINALS = [
  { pack: 'general', name: 'WORLD GEOGRAPHY', c: 'This country has the most time zones, with 12, when its overseas territories are counted', r: 'France' },
  { pack: 'general', name: 'THE CALENDAR', c: 'This is the only month that can pass without a full moon', r: 'February' },
  { pack: 'general', name: 'U.S. STATES', c: 'The only U.S. state whose name is one syllable', r: 'Maine' },
  { pack: 'general', name: 'ANIMALS', c: 'This Australian mammal lays eggs, has a duck-like bill, and the males have a venomous spur', r: 'The platypus' },
  { pack: 'general', name: 'THE HUMAN BODY', c: 'The only muscle in the body that is attached at one end only, letting it move freely', r: 'The tongue' },
  { pack: 'sports', name: 'THE OLYMPICS', c: 'This is the only city to have hosted the Summer Olympics three times', r: 'London' },
  { pack: 'sports', name: 'BASEBALL', c: 'The only perfect game ever pitched in the World Series was thrown by this Yankee in 1956', r: 'Don Larsen' },
  { pack: 'screen', name: 'MOVIE AWARDS', c: 'The first fully animated film ever nominated for the Best Picture Oscar, in 1991', r: 'Beauty and the Beast' },
  { pack: 'screen', name: 'TV HISTORY', c: 'This 1983 series finale is still the most-watched scripted TV episode in U.S. history', r: 'M*A*S*H' },
  { pack: 'food', name: 'WORLD CUISINE', c: 'This Roman pasta dish is named simply for its two main ingredients: cheese and pepper', r: 'Cacio e pepe' },
  { pack: 'food', name: 'FRUIT', c: 'The largest fruit that grows on a tree, it can weigh more than 100 pounds', r: 'The jackfruit' },
  { pack: 'science', name: 'THE PERIODIC TABLE', c: 'The chemical symbol W stands for this metal, whose name begins with a T', r: 'Tungsten' },
  { pack: 'science', name: 'SPACE', c: 'The first artificial satellite, launched by the Soviet Union in 1957', r: 'Sputnik' },
  { pack: 'history', name: 'U.S. PRESIDENTS', c: 'The only president to serve two non-consecutive terms before Donald Trump', r: 'Grover Cleveland' },
  { pack: 'history', name: 'WORLD HISTORY', c: 'The wall that divided this city came down in November 1989', r: 'Berlin' },
  { pack: 'pop', name: 'BRANDS', c: 'This company\'s name comes from a misspelling of "googol," the number 1 followed by 100 zeros', r: 'Google' },
  { pack: 'words', name: 'WORD ORIGINS', c: 'This word for a secret plan comes from the Latin for "to breathe together"', r: 'Conspiracy' },
  { pack: 'late', name: 'HAPPY HOUR', c: 'This cocktail of whiskey, sweet vermouth and bitters shares its name with a New York borough', r: 'A Manhattan' }
];

/* ------------------------------------------------------------- packaging */

const PACKS = [
  { id: 'general', name: 'General', blurb: 'A bit of everything', cats: GENERAL },
  { id: 'sports', name: 'Sports', blurb: 'Ballparks to the podium', cats: SPORTS },
  { id: 'screen', name: 'Movies, TV & Music', blurb: 'Screens and speakers', cats: SCREEN },
  { id: 'food', name: 'Food & Drink', blurb: 'Kitchens, bars and drive-thrus', cats: FOOD },
  { id: 'science', name: 'Science & Nature', blurb: 'Atoms, planets and dinosaurs', cats: SCIENCE },
  { id: 'history', name: 'History & Geography', blurb: 'Presidents, capitals, explorers', cats: HISTORY },
  { id: 'pop', name: 'Pop Culture & Tech', blurb: 'Apps, brands, games and slang', cats: POP },
  { id: 'words', name: 'Words & Wordplay', blurb: 'Rhymes, anagrams and sayings', cats: WORDS },
  { id: 'late', name: 'Late Night', blurb: 'Adults only', adult: true, cats: LATE }
];

const cats = [];
for (const p of PACKS) {
  p.cats.forEach((c, i) => {
    cats.push({ id: p.id + ':' + i, pack: p.id, name: c[0], clues: c.slice(1).map(x => ({ c: x[0], r: x[1] })) });
  });
}
const finals = FINALS.map((f, i) => Object.assign({ id: 'f:' + i }, f));

module.exports = {
  packs: PACKS.map(p => ({ id: p.id, name: p.name, blurb: p.blurb, adult: !!p.adult, count: p.cats.length })),
  cats,
  finals
};
